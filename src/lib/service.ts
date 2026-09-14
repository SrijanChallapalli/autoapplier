import type {
  Application,
  Confidence,
  Job,
  PreferenceSignal,
} from "./types";
import {
  addSignal,
  getApplicationByJob,
  getProfile,
  listApplications,
  listJobs,
  listSignals,
  newId,
  saveJobs,
  upsertApplication,
  upsertJob,
} from "./store";
import { parseJob, type ParseInput } from "./parse";
import { matchJob, rankJobs } from "./matching";
import { prepareApplication, isDuplicate } from "./prepare";
import { aiRefineJob } from "./ai";
import { extractSkills } from "./skills";
import { fetchLivePostings, type IngestOptions } from "./sources";

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
  let job = parseJob(input);

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
  const existing = await listJobs();

  // Match the live pull to the user's declared seniority by default.
  const internOnly =
    opts.internOnly ?? profile.preferences.seniority === "internship";

  const { postings, companiesReturned, companiesTried } =
    await fetchLivePostings({ ...opts, internOnly });

  const seenUrls = new Set(
    existing.map((j) => j.url).filter(Boolean) as string[],
  );
  const seenKeys = new Set(
    existing.map((j) => `${j.company}::${j.title}`.toLowerCase()),
  );

  const newJobs = [];
  let skippedDuplicates = 0;
  for (const p of postings) {
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

  if (newJobs.length) {
    await saveJobs([...newJobs, ...existing]);
  }

  return {
    found: postings.length,
    added: newJobs.length,
    skippedDuplicates,
    companiesReturned,
    companiesTried,
  };
}

// Recompute matches for every job (e.g. after the profile changes).
export async function rematchAll(): Promise<void> {
  const profile = await getProfile();
  const signals = await listSignals();
  const jobs = await listJobs();
  for (const job of jobs) {
    job.match = matchJob(job, { profile, signals });
  }
  await saveJobs(jobs);
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
  await upsertApplication(app);
  return { application: app };
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
