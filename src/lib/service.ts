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
import { computeInsights, type Insights } from "./insights";
import { resumeTextToMarkdown } from "./resumeBuild";
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

  // Edit in place: tailor whatever is already in the editor (the tailored resume
  // accumulates the user's edits and starts as their real uploaded resume). Fall
  // back to the raw uploaded resume, then to building from structured fields.
  const baseResume =
    app.tailoredResume?.trim() ||
    (profile.resumeText?.trim()
      ? resumeTextToMarkdown(profile.resumeText)
      : undefined);

  if (
    !baseResume &&
    profile.experience.length === 0 &&
    profile.projects.length === 0
  ) {
    return {
      error:
        "Add some experience or projects to your profile first (or upload a resume) — tailoring only rearranges your real content.",
    };
  }
  const resume = await aiTailorResume(
    job ?? ({ company: app.company, title: app.title, description: "" } as never),
    profile,
    baseResume,
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

  // Edit the candidate's actual resume in place. Anchor on whatever is currently
  // in the editor (which starts as their real uploaded resume); only fall back to
  // rebuilding from structured fields when there is genuinely nothing to edit.
  const baseResume =
    (currentResume ?? app.tailoredResume ?? "").trim() ||
    (profile.resumeText?.trim() ? resumeTextToMarkdown(profile.resumeText) : "");

  const system = [
    "You are a resume coach helping a student tailor their EXISTING resume to a specific role and pass ATS screens.",
    "You edit the candidate's current resume IN PLACE — you never rebuild it from scratch or reformat it into a different template.",
    "Rules:",
    "- Start from the CURRENT RESUME below and PRESERVE it: keep its existing sections, their order, its headings, its wording, and its Markdown conventions ('#', '##', '###', '-') by default.",
    "- Change ONLY what the user asks for (and what genuinely helps for this role): rephrase, strengthen, reorder, or trim EXISTING content and surface keywords the role emphasizes. Leave every other line exactly as written.",
    "- Do NOT rename, reorder, add, or drop sections unless the user explicitly asks. Do not impose a new structure and do not remove content just because the role doesn't mention it.",
    "- Use ONLY the candidate's real facts (the resume below, plus the facts JSON as a boundary). NEVER invent or add employers, roles, skills, dates, metrics, or bullets that aren't already there. If a required skill is missing, do not claim it.",
    "- Improve with stronger action verbs, quantified impact (only real numbers they already gave), keyword alignment, and ATS-friendly phrasing.",
    "",
    "OUTPUT FORMAT — follow EXACTLY:",
    "- If the user asks you to change, rewrite, improve, tailor, shorten, reorder, or edit the resume or ANY part of it (e.g. 'make my bullets stronger'), return the COMPLETE updated resume — the whole document with your edits merged in — inside ONE fenced block that starts with ```resume and ends with ```.",
    "- NEVER return only the changed lines or a single section. Always reproduce the whole resume so it can replace the current one, keeping the original's own formatting.",
    "- Put at most one short sentence of commentary BEFORE the block. Nothing after it.",
    "- Only when the user asks a pure question that requests NO change (e.g. 'what keywords am I missing?') may you answer in plain prose with no block.",
    "",
    `TARGET ROLE: ${job?.title ?? app.title} at ${job?.company ?? app.company}`,
    "",
    `JOB DESCRIPTION:\n${(job?.description ?? "").slice(0, 2500)}`,
    "",
    baseResume
      ? `CURRENT RESUME (edit this in place — this is the document to preserve and return):\n${baseResume}`
      : "The candidate has no resume yet — build a first draft strictly from the facts below.",
    "",
    `CANDIDATE FACTS (JSON — a boundary on what is true; do not exceed it):\n${JSON.stringify(facts, null, 2)}`,
  ].join("\n");

  const reply = await aiChatMessages(
    [{ role: "system", content: system }, ...messages],
    { temperature: 0.3 },
  );
  if (!reply) return { error: "The chat request failed — try again." };
  return { reply };
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
  // Onboarding: whether the user has entered enough profile to get real matches.
  profileComplete: boolean;
  totalApplications: number;
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
  const profile = await getProfile();

  // "Complete enough to match well": a name plus something to match on.
  const profileComplete =
    !!profile.fullName.trim() &&
    (profile.skills.length > 0 || profile.experience.length > 0);

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
    profileComplete,
    totalApplications: apps.length,
  };
}

export async function getInsights(): Promise<Insights> {
  const [apps, jobs, profile] = await Promise.all([
    listApplications(),
    listJobs(),
    getProfile(),
  ]);
  return computeInsights(apps, jobs, profile);
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
