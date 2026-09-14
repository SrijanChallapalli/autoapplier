import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  createPgBackend,
  __setBackendForTests,
  type QueryClient,
} from "../src/lib/db/backend";
import {
  getProfile,
  saveProfile,
  upsertJob,
  listJobs,
  updateJobs,
  getJob,
  upsertApplication,
  listApplications,
  addSignal,
  listSignals,
  getSettings,
  newId,
} from "../src/lib/store";
import { defaultProfile } from "../src/lib/defaultProfile";
import type { Application, Job } from "../src/lib/types";

// Back the store with a real Postgres engine running in-process (PGlite) so the
// SQL adapter is genuinely exercised, not mocked.
function pgClient(db: PGlite): QueryClient {
  return {
    query: (text, params) =>
      db.query(text, params as unknown[]) as Promise<{ rows: unknown[] }>,
  };
}

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  const backend = createPgBackend(pgClient(db));
  await backend.init();
  __setBackendForTests(backend);
});

afterEach(async () => {
  __setBackendForTests(null);
  await db.close();
});

function job(id: string, over: Partial<Job> = {}): Job {
  return {
    id,
    company: "Acme",
    title: "SWE Intern",
    description: "Python role",
    requiredSkills: ["Python"],
    niceToHaveSkills: [],
    source: "paste",
    createdAt: new Date().toISOString(),
    ...over,
  };
}

describe("Postgres-backed store (PGlite)", () => {
  it("returns defaults when empty", async () => {
    const p = await getProfile();
    expect(p.fullName).toBe(defaultProfile().fullName);
    const s = await getSettings();
    expect(s.internOnly).toBe(true);
    expect(s.companies.length).toBeGreaterThan(0);
  });

  it("round-trips the profile", async () => {
    const p = defaultProfile();
    p.fullName = "Round Trip";
    p.skills = ["Python", "Rust"];
    await saveProfile(p);
    const back = await getProfile();
    expect(back.fullName).toBe("Round Trip");
    expect(back.skills).toContain("Rust");
    expect(back.updatedAt).toBeTruthy();
  });

  it("upserts and lists jobs", async () => {
    await upsertJob(job("job_1", { title: "First" }));
    await upsertJob(job("job_2", { title: "Second" }));
    let jobs = await listJobs();
    expect(jobs).toHaveLength(2);

    // Upsert existing id updates in place, not append.
    await upsertJob(job("job_1", { title: "First Updated" }));
    jobs = await listJobs();
    expect(jobs).toHaveLength(2);
    expect((await getJob("job_1"))?.title).toBe("First Updated");
  });

  it("updateJobs applies an atomic transform", async () => {
    await upsertJob(job("job_1"));
    await upsertJob(job("job_2"));
    await updateJobs((jobs) => jobs.filter((j) => j.id === "job_2"));
    const jobs = await listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("job_2");
  });

  it("serializes concurrent upserts without losing writes", async () => {
    // Fire many upserts at once; the in-process lock must preserve all of them.
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => upsertJob(job(`job_${i}`))),
    );
    const jobs = await listJobs();
    expect(jobs).toHaveLength(25);
  });

  it("stores applications and signals", async () => {
    const app: Application = {
      id: newId("app"),
      jobId: "job_1",
      company: "Acme",
      title: "SWE Intern",
      status: "ready",
      confidence: "high",
      answers: [],
      openQuestions: [],
      matchSummary: "",
      keyRequirements: [],
      interviewStages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await upsertApplication(app);
    expect(await listApplications()).toHaveLength(1);

    await addSignal({
      id: newId("sig"),
      kind: "approved",
      jobTitle: "SWE Intern",
      company: "Acme",
      tags: ["python"],
      weight: 2,
      createdAt: new Date().toISOString(),
    });
    expect(await listSignals()).toHaveLength(1);
  });
});
