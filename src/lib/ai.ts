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
