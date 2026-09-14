import { promises as fs } from "fs";
import path from "path";
import type {
  Application,
  Job,
  PreferenceSignal,
  Profile,
} from "./types";
import { defaultProfile } from "./defaultProfile";

// ---------------------------------------------------------------------------
// A tiny file-backed JSON store. One file per collection under ./data.
//
// This is deliberately simple so the app "just runs" with no database. The API
// surface (getProfile, listJobs, upsertJob, ...) is the seam: to move to
// Postgres/Neon later, reimplement these functions and nothing else changes.
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), "data");

const FILES = {
  profile: path.join(DATA_DIR, "profile.json"),
  jobs: path.join(DATA_DIR, "jobs.json"),
  applications: path.join(DATA_DIR, "applications.json"),
  signals: path.join(DATA_DIR, "signals.json"),
} as const;

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
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
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
  await writeJson(FILES.profile, next);
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
  const jobs = await listJobs();
  const idx = jobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) jobs[idx] = job;
  else jobs.unshift(job);
  await writeJson(FILES.jobs, jobs);
  return job;
}

export async function saveJobs(jobs: Job[]): Promise<void> {
  await writeJson(FILES.jobs, jobs);
}

export async function deleteJob(id: string): Promise<void> {
  const jobs = (await listJobs()).filter((j) => j.id !== id);
  await writeJson(FILES.jobs, jobs);
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
  const apps = await listApplications();
  const idx = apps.findIndex((a) => a.id === app.id);
  const next = { ...app, updatedAt: new Date().toISOString() };
  if (idx >= 0) apps[idx] = next;
  else apps.unshift(next);
  await writeJson(FILES.applications, apps);
  return next;
}

export async function deleteApplication(id: string): Promise<void> {
  const apps = (await listApplications()).filter((a) => a.id !== id);
  await writeJson(FILES.applications, apps);
}

// --- Learning signals ------------------------------------------------------

export async function listSignals(): Promise<PreferenceSignal[]> {
  return readJson<PreferenceSignal[]>(FILES.signals, []);
}

export async function addSignal(
  signal: PreferenceSignal,
): Promise<PreferenceSignal> {
  const signals = await listSignals();
  signals.unshift(signal);
  await writeJson(FILES.signals, signals);
  return signal;
}
