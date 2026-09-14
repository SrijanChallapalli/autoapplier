import type { Job, Profile } from "./types";

// ---------------------------------------------------------------------------
// Optional LLM assistance via the Vercel AI Gateway (OpenAI-compatible API).
// Everything here is best-effort: if AI_GATEWAY_API_KEY is unset or the call
// fails, callers fall back to the deterministic engine. The LLM is only used to
// *rephrase and refine* — never to invent experience.
// ---------------------------------------------------------------------------

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

export function aiEnabled(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}

async function chat(
  system: string,
  user: string,
  opts: { json?: boolean } = {},
): Promise<string | null> {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) return null;
  const model = process.env.AI_MODEL || "anthropic/claude-sonnet-5";
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        ...(opts.json
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
      // Don't hang the request path forever.
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

// Refine loosely-parsed company/title/location and produce a 1-line role summary.
export async function aiRefineJob(
  job: Job,
): Promise<Partial<Pick<Job, "company" | "title" | "location">> | null> {
  const out = await chat(
    "You extract structured fields from a job posting. Return strict JSON with keys company, title, location. Use empty string if unknown. Do not guess.",
    `Posting:\n${job.description.slice(0, 4000)}`,
    { json: true },
  );
  if (!out) return null;
  try {
    const parsed = JSON.parse(out);
    const clean = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim() : undefined;
    return {
      company: clean(parsed.company),
      title: clean(parsed.title),
      location: clean(parsed.location),
    };
  } catch {
    return null;
  }
}

export function aiModel(): string {
  return process.env.AI_MODEL || "anthropic/claude-sonnet-5";
}

// Draft an answer to an application question, grounded strictly in the profile.
// Used for essay / "why this company" / short-answer prompts. Returns null if
// AI is disabled or the call fails, so the UI falls back to manual entry.
export async function aiDraftAnswer(
  question: string,
  job: Job,
  profile: Profile,
): Promise<string | null> {
  const facts = {
    name: profile.fullName,
    university: profile.university,
    major: profile.major,
    graduation: profile.graduationDate,
    skills: profile.skills,
    interests: profile.preferences.interests,
    experience: profile.experience.map((e) => ({
      title: e.title,
      company: e.company,
      bullets: e.bullets,
    })),
    projects: profile.projects.map((p) => ({
      name: p.name,
      description: p.description,
      bullets: p.bullets,
    })),
  };
  return chat(
    [
      "You help a candidate draft honest answers to job-application questions.",
      "Rules you must follow:",
      "- Use ONLY the candidate facts provided. Never invent experience, skills, numbers, or qualifications.",
      "- If the question asks about something not in the facts, write a truthful answer that draws on the closest real facts, and do not fabricate.",
      "- Write in first person, natural and specific, no clichés or filler.",
      "- Keep it concise unless the question implies an essay; then ~150-220 words.",
      "- Output only the answer text, no preamble.",
    ].join("\n"),
    `Company: ${job.company}\nRole: ${job.title}\n\nQuestion: ${question}\n\nCandidate facts (JSON):\n${JSON.stringify(
      facts,
      null,
      2,
    )}`,
  );
}

// A grounded cover letter for a specific role. Uses only real profile facts.
export async function aiCoverLetter(
  job: Job,
  profile: Profile,
): Promise<string | null> {
  const facts = {
    name: profile.fullName,
    university: profile.university,
    major: profile.major,
    graduation: profile.graduationDate,
    skills: profile.skills,
    experience: profile.experience.map((e) => ({
      title: e.title,
      company: e.company,
      bullets: e.bullets,
    })),
    projects: profile.projects.map((p) => ({
      name: p.name,
      description: p.description,
      bullets: p.bullets,
    })),
  };
  return chat(
    [
      "Write a concise, specific cover letter (about 200-280 words) for this role.",
      "Rules:",
      "- Use ONLY the provided candidate facts. Never invent employers, skills, metrics, or achievements.",
      "- Connect the candidate's real experience/projects to what the role needs.",
      "- First person, warm but professional, no clichés ('I am writing to express'), no fabricated enthusiasm about specifics you don't have.",
      "- Do not include address blocks or a date; start with 'Dear Hiring Team,'.",
      "- Output only the letter.",
    ].join("\n"),
    `Role: ${job.title} at ${job.company}\n\nRole description:\n${(job.description ?? "").slice(
      0,
      2500,
    )}\n\nCandidate facts (JSON):\n${JSON.stringify(facts, null, 2)}`,
  );
}

// A natural-language "why you're a good match" paragraph for the review summary.
// Grounded strictly in the provided profile facts.
export async function aiMatchNarrative(
  job: Job,
  profile: Profile,
): Promise<string | null> {
  const facts = {
    skills: profile.skills,
    experience: profile.experience.map((e) => ({
      title: e.title,
      company: e.company,
      bullets: e.bullets,
    })),
    projects: profile.projects.map((p) => ({
      name: p.name,
      bullets: p.bullets,
    })),
    matchedSkills: job.match?.matchedSkills ?? [],
    missingSkills: job.match?.missingSkills ?? [],
  };
  return chat(
    "You are a careful job-search assistant. Write 2-3 sentences on why this candidate fits this role. Use ONLY the provided facts — never invent skills, experience, or accomplishments. Be concrete and honest about gaps.",
    `Role: ${job.title} at ${job.company}\n\nRequired skills: ${job.requiredSkills.join(
      ", ",
    )}\n\nCandidate facts (JSON):\n${JSON.stringify(facts, null, 2)}`,
  );
}
