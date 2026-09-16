import type {
  Application,
  Confidence,
  Job,
  PreferenceSignal,
} from "./types";
import {
  addSignal,
  getApplication,
  getApplicationByJob,
  getJob,
  getProfile,
  getSettings,
  listApplications,
  listJobs,
  listSignals,
  newId,
  updateJobs,
  upsertApplication,
  upsertJob,
} from "./store";
import { parseJob, type ParseInput } from "./parse";
import { matchJob, rankJobs } from "./matching";
import { prepareApplication, isDuplicate } from "./prepare";
import {
  aiRefineJob,
  aiMatchNarrative,
  aiDraftAnswer,
  aiCoverLetter,
  aiTailorResume,
  aiOutreachMessage,
  aiChatMessages,
  aiEnabled,
  aiModel,
  aiEndpoint,
  aiIsLocal,
  type ChatMessage,
} from "./ai";
import { buildNetworkingLinks, type NetworkLink } from "./networking";
import { countryAllowed } from "./geo";
import { analyzeFlags, type FlagReport } from "./flags";
import { extractSkills } from "./skills";
import {
  fetchLivePostings,
  fetchPostingFromUrl,
  type IngestOptions,
} from "./sources";

// ---------------------------------------------------------------------------
// High-level operations the API routes call. Orchestrates parse -> match ->
// prepare -> track, plus dedup and the learning loop.
// ---------------------------------------------------------------------------

export async function importAndMatch(
  input: ParseInput,
  opts: { useAI?: boolean } = {},
): Promise<Job> {
  const profile = await getProfile();
  const signals = await listSignals();

  // If we were given a URL but no real text, fetch and extract the posting.
  let resolved = input;
  if ((!input.text || input.text.trim().length < 40) && input.url) {
    const posting = await fetchPostingFromUrl(input.url);
    if (posting) {
      resolved = {
        text: posting.text,
        url: input.url,
        company: input.company || posting.company,
        title: input.title || posting.title,
        location: input.location || posting.location,
      };
    }
  }

  let job = parseJob(resolved);

  // Optional LLM refinement of company/title/location when the heuristic is weak.
  if (opts.useAI !== false) {
    const weak =
      job.company === "Unknown company" || job.title === "Untitled role";
    if (weak) {
      const refined = await aiRefineJob(job);
      if (refined) job = { ...job, ...stripEmpty(refined) };
    }
  }

  job.match = matchJob(job, { profile, signals });
  await upsertJob(job);
  return job;
}

function stripEmpty<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== "") (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

// Pull live postings from official ATS APIs, dedupe against what we already
// have, then parse + match each new one. Returns a summary for the UI.
export interface IngestSummary {
  found: number; // relevant postings returned across all boards
  added: number; // new jobs saved
  skippedDuplicates: number;
  companiesReturned: number;
  companiesTried: number;
}

export async function ingestLiveJobs(
  opts: IngestOptions = {},
): Promise<IngestSummary> {
  const profile = await getProfile();
  const signals = await listSignals();
  const settings = await getSettings();

  const internOnly = opts.internOnly ?? settings.internOnly;
  const companies = opts.companies ?? settings.companies;
  const keywords =
    opts.keywords ??
    (settings.fetchKeywords.length ? settings.fetchKeywords : undefined);

  const { postings, companiesReturned, companiesTried } =
    await fetchLivePostings({
      companies,
      internOnly,
      keywords,
      perCompanyLimit: opts.perCompanyLimit,
    });

  let added = 0;
  let skippedDuplicates = 0;
  const allowedCountries = profile.preferences.countries ?? [];

  // Dedup + write under the jobs lock so a concurrent fetch can't lose rows.
  await updateJobs((existing) => {
    const seenUrls = new Set(
      existing.map((j) => j.url).filter(Boolean) as string[],
    );
    const seenKeys = new Set(
      existing.map((j) => `${j.company}::${j.title}`.toLowerCase()),
    );
    const newJobs = [];
    for (const p of postings) {
      // Skip roles outside the user's target countries.
      if (!countryAllowed(p.location, allowedCountries)) continue;
      const key = `${p.company}::${p.title}`.toLowerCase();
      if ((p.url && seenUrls.has(p.url)) || seenKeys.has(key)) {
        skippedDuplicates++;
        continue;
      }
      seenKeys.add(key);
      if (p.url) seenUrls.add(p.url);

      const job = parseJob({
        text: p.text,
        url: p.url,
        company: p.company,
        title: p.title,
        location: p.location,
      });
      job.source = "scraper";
      if (p.remote) job.remote = true;
      job.match = matchJob(job, { profile, signals });
      newJobs.push(job);
    }
    added = newJobs.length;
    return [...newJobs, ...existing];
  });

  return {
    found: postings.length,
    added,
    skippedDuplicates,
    companiesReturned,
    companiesTried,
  };
}

// Recompute matches for every job (e.g. after the profile changes).
export async function rematchAll(): Promise<void> {
  const profile = await getProfile();
  const signals = await listSignals();
  await updateJobs((jobs) => {
    for (const job of jobs) {
      job.match = matchJob(job, { profile, signals });
    }
    return jobs;
  });
}

export async function getRankedJobs(): Promise<Job[]> {
  return rankJobs(await listJobs());
}

// Prepare an application, guarding against duplicates.
export async function prepareForJob(
  jobId: string,
): Promise<{ application?: Application; error?: string }> {
  const jobs = await listJobs();
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return { error: "Job not found" };

  const existing = await getApplicationByJob(jobId);
  if (existing) return { application: existing };

  const apps = await listApplications();
  if (isDuplicate(job, apps)) {
    return {
      error: `Looks like a duplicate of an existing application to ${job.company}. Skipped to avoid applying twice.`,
    };
  }

  const profile = await getProfile();
  const app = prepareApplication(job, profile);

  // If AI is enabled, enrich the "why you're a good match" summary with a
  // grounded narrative. Best-effort — never blocks preparation.
  if (aiEnabled()) {
    const narrative = await aiMatchNarrative(job, profile);
    if (narrative) app.matchSummary = narrative;
  }

  await upsertApplication(app);
  return { application: app };
}

// Draft a grounded answer to an application question using the LLM.
export async function draftAnswerForApplication(
  applicationId: string,
  question: string,
): Promise<{ draft?: string; error?: string }> {
  if (!aiEnabled()) {
    return {
      error:
        "AI drafting is off. Add an AI Gateway key (AI_GATEWAY_API_KEY) to enable it.",
    };
  }
  const app = await getApplication(applicationId);
  if (!app) return { error: "Application not found" };
  const job = await getJob(app.jobId);
  const profile = await getProfile();
  const draft = await aiDraftAnswer(
    question,
    job ?? ({ company: app.company, title: app.title } as never),
    profile,
  );
  if (!draft) return { error: "The AI draft request failed — try again." };
  return { draft };
}

// Generate a grounded cover letter for an application and persist it.
export async function generateCoverLetter(
  applicationId: string,
): Promise<{ coverLetter?: string; error?: string }> {
  if (!aiEnabled()) {
    return {
      error:
        "Cover letters need an AI Gateway key (AI_GATEWAY_API_KEY). Add one to enable.",
    };
  }
  const app = await getApplication(applicationId);
  if (!app) return { error: "Application not found" };
  const job = await getJob(app.jobId);
  const profile = await getProfile();
  const letter = await aiCoverLetter(
    job ??
      ({
        company: app.company,
        title: app.title,
        description: "",
      } as never),
    profile,
  );
  if (!letter) return { error: "The cover letter request failed — try again." };
  await upsertApplication({ ...app, coverLetter: letter });
  return { coverLetter: letter };
}

// Generate a tailored resume for an application and persist it.
export async function generateTailoredResume(
  applicationId: string,
): Promise<{ tailoredResume?: string; error?: string }> {
  if (!aiEnabled()) {
    return {
      error:
        "Resume tailoring needs an AI Gateway key (AI_GATEWAY_API_KEY). Add one to enable.",
    };
  }
  const app = await getApplication(applicationId);
  if (!app) return { error: "Application not found" };
  const job = await getJob(app.jobId);
  const profile = await getProfile();
  if (profile.experience.length === 0 && profile.projects.length === 0) {
    return {
      error:
        "Add some experience or projects to your profile first (or upload a resume) — tailoring only rearranges your real content.",
    };
  }
  const resume = await aiTailorResume(
    job ?? ({ company: app.company, title: app.title, description: "" } as never),
    profile,
  );
  if (!resume) return { error: "The tailoring request failed — try again." };
  await upsertApplication({ ...app, tailoredResume: resume });
  return { tailoredResume: resume };
}

// --- Networking -------------------------------------------------------------

export async function networkingForApplication(
  applicationId: string,
): Promise<{ links?: NetworkLink[]; error?: string }> {
  const app = await getApplication(applicationId);
  if (!app) return { error: "Application not found" };
  const profile = await getProfile();
  return {
    links: buildNetworkingLinks(app.company, app.title, profile.university),
  };
}

export async function outreachForApplication(
  applicationId: string,
): Promise<{ message?: string; error?: string }> {
  if (!aiEnabled()) {
    return {
      error:
        "Outreach drafting needs an AI Gateway key (AI_GATEWAY_API_KEY). Add one to enable.",
    };
  }
  const app = await getApplication(applicationId);
  if (!app) return { error: "Application not found" };
  const profile = await getProfile();
  const message = await aiOutreachMessage(app.company, app.title, profile);
  if (!message) return { error: "The outreach request failed — try again." };
  return { message };
}

// Green/yellow/red flags + ATS suggestions for a prepared application.
export async function flagsForApplication(
  applicationId: string,
): Promise<{ report?: FlagReport; error?: string }> {
  const app = await getApplication(applicationId);
  if (!app) return { error: "Application not found" };
  const job = await getJob(app.jobId);
  if (!job) return { error: "Job not found" };
  const profile = await getProfile();
  return { report: analyzeFlags(job, profile, app) };
}

// Interactive resume-editor chat for a specific role. Grounded in the profile;
// never invents. When asked for a rewrite, the model returns the full resume in
// a ```resume fenced block that the UI can apply to the tailored resume.
export async function resumeChatForApplication(
  applicationId: string,
  messages: ChatMessage[],
  currentResume?: string,
): Promise<{ reply?: string; error?: string }> {
  if (!aiEnabled()) {
    return {
      error:
        "The resume editor chat needs an AI Gateway key (AI_GATEWAY_API_KEY). Add one to enable it.",
    };
  }
  const app = await getApplication(applicationId);
  if (!app) return { error: "Application not found" };
  const job = await getJob(app.jobId);
  const profile = await getProfile();

  const facts = {
    name: profile.fullName,
    education: {
      university: profile.university,
      major: profile.major,
      graduation: profile.graduationDate,
    },
    skills: profile.skills,
    experience: profile.experience,
    projects: profile.projects,
  };
  const system = [
    "You are a resume coach helping a student tailor their resume to a specific role and pass ATS screens.",
    "Rules:",
    "- Use ONLY the candidate's real facts (below). NEVER invent employers, roles, skills, dates, metrics, or bullets.",
    "- Improve with stronger action verbs, quantified impact (only real numbers they gave), keyword alignment to the job, ordering, and ATS-friendly formatting.",
    "",
    "OUTPUT FORMAT — follow EXACTLY:",
    "- If the user asks you to change, rewrite, improve, tailor, shorten, reorder, or edit the resume or ANY part of it (e.g. 'make my bullets stronger'), you MUST return the COMPLETE updated resume — EVERY section from the name line through education — inside ONE fenced block that starts with ```resume and ends with ```.",
    "- NEVER return only the changed lines or a single section. Always reproduce the whole resume with your edits merged in, so it can replace the current one.",
    "- Put at most one short sentence of commentary BEFORE the block. Nothing after it.",
    "- Only when the user asks a pure question that requests NO change (e.g. 'what keywords am I missing?') may you answer in plain prose with no block.",
    "",
    "Use this EXACT ATS-safe Markdown structure inside the block (it is rendered to a PDF):",
    "- '# Full Name' then a contact line of items separated by ' | ' (no icons/labels).",
    "- Sections as '## Heading' with these names in order: Education, Experience, Projects, Technical Skills (optional '## Summary' first).",
    "- Entry headers '### Left | Right' — Experience: '### Job Title | Mon YYYY – Mon YYYY' then 'Company | City, State'; Education: '### University | City, State' then 'Degree, Major | Mon YYYY – Mon YYYY'; Projects: '### Name | Tech, Stack'.",
    "- Bullets start with '- '. Technical Skills as 'Label: a, b, c' lines. No tables, columns, icons, or emojis.",
    "Example:",
    "Here's the updated resume:",
    "```resume",
    "# Jane Doe",
    "jane@email.com | (555) 123-4567 | linkedin.com/in/jane | github.com/jane",
    "",
    "## Experience",
    "### Software Engineer Intern | May 2025 – Aug 2025",
    "Acme Corp | Remote",
    "- Built X that improved Y by Z%",
    "",
    "## Education",
    "### State University | City, ST",
    "B.S. in Computer Science | Aug 2023 – May 2027",
    "```",
    "",
    `TARGET ROLE: ${job?.title ?? app.title} at ${job?.company ?? app.company}`,
    "",
    `JOB DESCRIPTION:\n${(job?.description ?? "").slice(0, 2500)}`,
    "",
    `CANDIDATE FACTS (JSON):\n${JSON.stringify(facts, null, 2)}`,
    (currentResume ?? app.tailoredResume)
      ? `\nCURRENT TAILORED RESUME:\n${currentResume ?? app.tailoredResume}`
      : "",
  ].join("\n");

  const reply = await aiChatMessages(
    [{ role: "system", content: system }, ...messages],
    { temperature: 0.3 },
  );
  if (!reply) return { error: "The chat request failed — try again." };
  return { reply };
}

// Rewrite a SINGLE resume line/bullet with a focused action and tone, grounded
// in the candidate's real facts and the target role. Returns just the rewritten
// line text (no markdown prefix, no commentary) so the UI can splice it back in.
export type RewriteAction = "strengthen" | "quantify" | "shorten" | "match";
export type RewriteTone = "concise" | "impact" | "technical" | "leadership";

export async function rewriteResumeLine(
  applicationId: string,
  text: string,
  action: RewriteAction,
  tone: RewriteTone,
): Promise<{ text?: string; error?: string }> {
  if (!aiEnabled()) {
    return {
      error:
        "Per-line rewriting needs an AI Gateway key (AI_GATEWAY_API_KEY) or a local endpoint. Add one to enable it.",
    };
  }
  const clean = text.trim();
  if (!clean) return { error: "Nothing to rewrite" };

  const app = await getApplication(applicationId);
  if (!app) return { error: "Application not found" };
  const job = await getJob(app.jobId);
  const profile = await getProfile();

  const actionInstruction: Record<RewriteAction, string> = {
    strengthen:
      "Rewrite it with a stronger action verb and clearer impact. Do not invent facts.",
    quantify:
      "Surface concrete scope or impact. ONLY use numbers the candidate actually provided in their facts; if none apply, sharpen the wording instead of inventing a metric.",
    shorten:
      "Tighten it to one crisp line — cut filler, keep the substance and any real metrics.",
    match:
      "Rephrase it to echo the language and keywords of the target role WHERE THEY TRUTHFULLY APPLY. Never claim a skill or result the candidate doesn't have.",
  };
  const toneInstruction: Record<RewriteTone, string> = {
    concise: "Voice: concise and plain — short, direct, no fluff.",
    impact: "Voice: impact-first — lead with the result or outcome.",
    technical: "Voice: technical and specific — name the real tools/methods used.",
    leadership:
      "Voice: ownership and scope — emphasize initiative, collaboration, and leadership that actually happened.",
  };

  const facts = {
    skills: profile.skills,
    experience: profile.experience,
    projects: profile.projects,
  };
  const system = [
    "You improve a single resume line for a student tailoring their resume to a role.",
    "Rules:",
    "- Use ONLY the candidate's real facts (below). NEVER invent employers, skills, dates, metrics, or achievements.",
    "- Return ONLY the rewritten line as plain text: no markdown, no bullet symbol, no quotes, no preamble.",
    "- Keep it a single line, similar length unless asked to shorten.",
    actionInstruction[action],
    toneInstruction[tone],
    "",
    `TARGET ROLE: ${job?.title ?? app.title} at ${job?.company ?? app.company}`,
    `ROLE KEYWORDS: ${[...(job?.requiredSkills ?? []), ...(job?.niceToHaveSkills ?? [])].join(", ")}`,
    `CANDIDATE FACTS (JSON):\n${JSON.stringify(facts, null, 2)}`,
  ].join("\n");

  const reply = await aiChatMessages(
    [
      { role: "system", content: system },
      { role: "user", content: `Line to rewrite:\n${clean}` },
    ],
    { temperature: 0.3 },
  );
  if (!reply) return { error: "The rewrite request failed — try again." };
  const out = reply
    .trim()
    .replace(/^```[\s\S]*?\n|```$/g, "")
    .replace(/^\s*[-*•]\s+/, "")
    .replace(/^["'“”]|["'“”]$/g, "")
    .trim();
  return { text: out || clean };
}

export function aiStatus(): {
  enabled: boolean;
  model: string | null;
  local: boolean;
  endpoint: string | null;
} {
  const enabled = aiEnabled();
  const local = aiIsLocal();
  return {
    enabled,
    model: enabled ? aiModel() : null,
    local,
    // Only reveal the endpoint when it's a custom/local one (the default
    // gateway URL isn't interesting to show).
    endpoint: local ? aiEndpoint() : null,
  };
}

// Prepare applications for the top recommended, eligible jobs that don't yet
// have one. Powers the dashboard's "prepare all" action.
export async function prepareTopMatches(
  limit = 12,
): Promise<{ prepared: number; skipped: number }> {
  const ranked = await getRankedJobs();
  const apps = await listApplications();
  const withApp = new Set(apps.map((a) => a.jobId));

  let prepared = 0;
  let skipped = 0;
  for (const job of ranked) {
    if (prepared >= limit) break;
    if (!job.match?.recommended || !job.match?.eligible || job.dismissed) continue;
    if (withApp.has(job.id)) continue;
    const { application } = await prepareForJob(job.id);
    if (application) prepared++;
    else skipped++;
  }
  return { prepared, skipped };
}

// --- Dashboard summary ------------------------------------------------------

export interface DashboardStats {
  foundToday: number;
  totalJobs: number;
  matched: number; // recommended & eligible
  ready: number; // high-confidence applications ready to submit
  needsReview: number; // medium confidence
  needsInput: number; // low confidence / open questions
  submitted: number;
  headline: string;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export async function dashboardStats(): Promise<DashboardStats> {
  const jobs = await listJobs();
  const apps = await listApplications();

  const foundToday = jobs.filter((j) => isToday(j.createdAt)).length;
  const matched = jobs.filter(
    (j) => j.match?.recommended && j.match?.eligible && !j.dismissed,
  ).length;

  const ready = apps.filter((a) => a.status === "ready").length;
  const needsReview = apps.filter((a) => a.status === "needs_review").length;
  const needsInput = apps.filter((a) => a.status === "needs_input").length;
  const submitted = apps.filter((a) =>
    ["submitted", "screening", "interviewing", "offer", "rejected"].includes(
      a.status,
    ),
  ).length;

  const headline =
    `${foundToday || jobs.length} job${
      (foundToday || jobs.length) === 1 ? "" : "s"
    } ${foundToday ? "found today" : "in your pipeline"}. ` +
    `${matched} matched your profile. ` +
    `${ready} ${ready === 1 ? "application is" : "applications are"} ready to submit, ` +
    `${needsReview} require your approval, and ${needsInput} need you to answer a question.`;

  return {
    foundToday,
    totalJobs: jobs.length,
    matched,
    ready,
    needsReview,
    needsInput,
    submitted,
    headline,
  };
}

// --- Learning loop ----------------------------------------------------------

const SIGNAL_WEIGHTS: Record<PreferenceSignal["kind"], number> = {
  approved: 2,
  interview: 3,
  response: 2,
  rejected: -2,
};

export async function recordSignal(
  kind: PreferenceSignal["kind"],
  job: { company: string; title: string; description?: string },
): Promise<PreferenceSignal> {
  const tags = extractSkills(
    `${job.title} ${job.description ?? ""}`,
  );
  const signal: PreferenceSignal = {
    id: newId("sig"),
    kind,
    jobTitle: job.title,
    company: job.company,
    tags,
    weight: SIGNAL_WEIGHTS[kind],
    createdAt: new Date().toISOString(),
  };
  await addSignal(signal);
  return signal;
}

export function confidenceLabel(c: Confidence): string {
  return { high: "High confidence", medium: "Medium confidence", low: "Low confidence" }[c];
}
