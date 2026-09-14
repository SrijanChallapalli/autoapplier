import { promises as fs } from "fs";
import path from "path";
import type {
  Application,
  Job,
  PreferenceSignal,
  Profile,
  Settings,
} from "./types";
import { defaultProfile } from "./defaultProfile";
import { DEFAULT_COMPANIES } from "./sources/companies";

// ---------------------------------------------------------------------------
// A tiny file-backed JSON store. One file per collection under ./data.
//
// This is deliberately simple so the app "just runs" with no database. The API
// surface (getProfile, listJobs, upsertJob, ...) is the seam: to move to
// Postgres/Neon later, reimplement these functions and nothing else changes.
// ---------------------------------------------------------------------------

// Local dev writes under ./data. On a read-only/serverless filesystem (Vercel)
// fall back to a writable tmp dir so the app runs — though tmp is ephemeral, so
// real deployments should swap this store for a database (see README).
const DATA_DIR =
  process.env.AUTOAPPLIER_DATA_DIR ||
  (process.env.VERCEL
    ? path.join("/tmp", "autoapplier-data")
    : path.join(process.cwd(), "data"));

const FILES = {
  profile: path.join(DATA_DIR, "profile.json"),
  jobs: path.join(DATA_DIR, "jobs.json"),
  applications: path.join(DATA_DIR, "applications.json"),
  signals: path.join(DATA_DIR, "signals.json"),
  settings: path.join(DATA_DIR, "settings.json"),
} as const;

export function defaultSettings(): Settings {
  return {
    companies: DEFAULT_COMPANIES,
    internOnly: true,
    fetchKeywords: [],
    updatedAt: new Date().toISOString(),
  };
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await ensureDir();
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

// Per-file async mutex. Read-modify-write sequences (upserts, deletes) must run
// under the lock so concurrent requests can't clobber each other's writes —
// this matters when the live fetch adds dozens of jobs while other requests run.
const locks = new Map<string, Promise<void>>();

async function withLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(file) ?? Promise.resolve();
  // Chain: the next holder waits for this one to settle (never rejects the chain).
  const run = prev.then(fn, fn);
  locks.set(
    file,
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
  const p = await readJson<Profile | null>(FILES.profile, null);
  return p ?? defaultProfile();
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  const next = { ...profile, updatedAt: new Date().toISOString() };
  await withLock(FILES.profile, () => writeJson(FILES.profile, next));
  return next;
}

// --- Settings --------------------------------------------------------------

export async function getSettings(): Promise<Settings> {
  const s = await readJson<Settings | null>(FILES.settings, null);
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
  await withLock(FILES.settings, () => writeJson(FILES.settings, next));
  return next;
}

// --- Jobs ------------------------------------------------------------------

export async function listJobs(): Promise<Job[]> {
  return readJson<Job[]>(FILES.jobs, []);
}

export async function getJob(id: string): Promise<Job | undefined> {
  const jobs = await listJobs();
  return jobs.find((j) => j.id === id);
}

export async function upsertJob(job: Job): Promise<Job> {
  return withLock(FILES.jobs, async () => {
    const jobs = await listJobs();
    const idx = jobs.findIndex((j) => j.id === job.id);
    if (idx >= 0) jobs[idx] = job;
    else jobs.unshift(job);
    await writeJson(FILES.jobs, jobs);
    return job;
  });
}

export async function saveJobs(jobs: Job[]): Promise<void> {
  await withLock(FILES.jobs, () => writeJson(FILES.jobs, jobs));
}

// Atomic read-modify-write over the whole jobs collection, under the file lock.
// Used by bulk operations (live ingest, rematch) so they never lose writes.
export async function updateJobs(
  fn: (jobs: Job[]) => Job[] | Promise<Job[]>,
): Promise<Job[]> {
  return withLock(FILES.jobs, async () => {
    const jobs = await listJobs();
    const next = await fn(jobs);
    await writeJson(FILES.jobs, next);
    return next;
  });
}

export async function deleteJob(id: string): Promise<void> {
  await withLock(FILES.jobs, async () => {
    const jobs = (await listJobs()).filter((j) => j.id !== id);
    await writeJson(FILES.jobs, jobs);
  });
}

// --- Applications ----------------------------------------------------------

export async function listApplications(): Promise<Application[]> {
  return readJson<Application[]>(FILES.applications, []);
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
  return withLock(FILES.applications, async () => {
    const apps = await listApplications();
    const idx = apps.findIndex((a) => a.id === app.id);
    const next = { ...app, updatedAt: new Date().toISOString() };
    if (idx >= 0) apps[idx] = next;
    else apps.unshift(next);
    await writeJson(FILES.applications, apps);
    return next;
  });
}

export async function deleteApplication(id: string): Promise<void> {
  await withLock(FILES.applications, async () => {
    const apps = (await listApplications()).filter((a) => a.id !== id);
    await writeJson(FILES.applications, apps);
  });
}

// --- Learning signals ------------------------------------------------------

export async function listSignals(): Promise<PreferenceSignal[]> {
  return readJson<PreferenceSignal[]>(FILES.signals, []);
}

export async function addSignal(
  signal: PreferenceSignal,
): Promise<PreferenceSignal> {
  return withLock(FILES.signals, async () => {
    const signals = await listSignals();
    signals.unshift(signal);
    await writeJson(FILES.signals, signals);
    return signal;
  });
}
