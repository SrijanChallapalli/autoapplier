import type {
  Application,
  Job,
  PreferenceSignal,
  Profile,
  Settings,
} from "./types";
import { defaultProfile } from "./defaultProfile";
import { DEFAULT_COMPANIES } from "./sources/companies";
import { getBackend } from "./db/backend";

// ---------------------------------------------------------------------------
// The store persists a handful of JSON documents keyed by collection name.
// Where they live (JSON files vs Postgres) is decided in db/backend.ts by the
// DATABASE_URL env var; everything here is backend-agnostic.
// ---------------------------------------------------------------------------

const KEYS = {
  profile: "profile",
  jobs: "jobs",
  applications: "applications",
  signals: "signals",
  settings: "settings",
} as const;

export function defaultSettings(): Settings {
  return {
    companies: DEFAULT_COMPANIES,
    internOnly: true,
    fetchKeywords: [],
    updatedAt: new Date().toISOString(),
  };
}

async function read<T>(key: string, fallback: T): Promise<T> {
  return (await getBackend()).read(key, fallback);
}

async function write(key: string, value: unknown): Promise<void> {
  return (await getBackend()).write(key, value);
}

// Per-key async mutex. Read-modify-write sequences (upserts, deletes) must run
// under the lock so concurrent requests can't clobber each other's writes —
// this matters when the live fetch adds dozens of jobs while other requests run.
// (In-process; single-instance. A multi-instance deploy would use row locks.)
const locks = new Map<string, Promise<void>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  // Chain: the next holder waits for this one to settle (never rejects the chain).
  const run = prev.then(fn, fn);
  locks.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

export function newId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

// --- Profile ---------------------------------------------------------------

export async function getProfile(): Promise<Profile> {
  const p = await read<Profile | null>(KEYS.profile, null);
  return p ?? defaultProfile();
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  const next = { ...profile, updatedAt: new Date().toISOString() };
  await withLock(KEYS.profile, () => write(KEYS.profile, next));
  return next;
}

// --- Settings --------------------------------------------------------------

export async function getSettings(): Promise<Settings> {
  const s = await read<Settings | null>(KEYS.settings, null);
  if (!s) return defaultSettings();
  // Merge so new fields get defaults if the stored file predates them.
  const d = defaultSettings();
  return {
    companies: s.companies?.length ? s.companies : d.companies,
    internOnly: s.internOnly ?? d.internOnly,
    fetchKeywords: s.fetchKeywords ?? d.fetchKeywords,
    updatedAt: s.updatedAt ?? d.updatedAt,
  };
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const next = { ...settings, updatedAt: new Date().toISOString() };
  await withLock(KEYS.settings, () => write(KEYS.settings, next));
  return next;
}

// --- Jobs ------------------------------------------------------------------

export async function listJobs(): Promise<Job[]> {
  return read<Job[]>(KEYS.jobs, []);
}

export async function getJob(id: string): Promise<Job | undefined> {
  const jobs = await listJobs();
  return jobs.find((j) => j.id === id);
}

export async function upsertJob(job: Job): Promise<Job> {
  return withLock(KEYS.jobs, async () => {
    const jobs = await listJobs();
    const idx = jobs.findIndex((j) => j.id === job.id);
    if (idx >= 0) jobs[idx] = job;
    else jobs.unshift(job);
    await write(KEYS.jobs, jobs);
    return job;
  });
}

export async function saveJobs(jobs: Job[]): Promise<void> {
  await withLock(KEYS.jobs, () => write(KEYS.jobs, jobs));
}

// Atomic read-modify-write over the whole jobs collection, under the file lock.
// Used by bulk operations (live ingest, rematch) so they never lose writes.
export async function updateJobs(
  fn: (jobs: Job[]) => Job[] | Promise<Job[]>,
): Promise<Job[]> {
  return withLock(KEYS.jobs, async () => {
    const jobs = await listJobs();
    const next = await fn(jobs);
    await write(KEYS.jobs, next);
    return next;
  });
}

export async function deleteJob(id: string): Promise<void> {
  await withLock(KEYS.jobs, async () => {
    const jobs = (await listJobs()).filter((j) => j.id !== id);
    await write(KEYS.jobs, jobs);
  });
}

// --- Applications ----------------------------------------------------------

export async function listApplications(): Promise<Application[]> {
  return read<Application[]>(KEYS.applications, []);
}

export async function getApplication(
  id: string,
): Promise<Application | undefined> {
  const apps = await listApplications();
  return apps.find((a) => a.id === id);
}

export async function getApplicationByJob(
  jobId: string,
): Promise<Application | undefined> {
  const apps = await listApplications();
  return apps.find((a) => a.jobId === jobId);
}

export async function upsertApplication(
  app: Application,
): Promise<Application> {
  return withLock(KEYS.applications, async () => {
    const apps = await listApplications();
    const idx = apps.findIndex((a) => a.id === app.id);
    const next = { ...app, updatedAt: new Date().toISOString() };
    if (idx >= 0) apps[idx] = next;
    else apps.unshift(next);
    await write(KEYS.applications, apps);
    return next;
  });
}

export async function deleteApplication(id: string): Promise<void> {
  await withLock(KEYS.applications, async () => {
    const apps = (await listApplications()).filter((a) => a.id !== id);
    await write(KEYS.applications, apps);
  });
}

// --- Learning signals ------------------------------------------------------

export async function listSignals(): Promise<PreferenceSignal[]> {
  return read<PreferenceSignal[]>(KEYS.signals, []);
}

export async function addSignal(
  signal: PreferenceSignal,
): Promise<PreferenceSignal> {
  return withLock(KEYS.signals, async () => {
    const signals = await listSignals();
    signals.unshift(signal);
    await write(KEYS.signals, signals);
    return signal;
  });
}
