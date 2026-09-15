import { describe, it, expect } from "vitest";
import { matchJob, rankJobs } from "../src/lib/matching";
import { parseJob } from "../src/lib/parse";
import { defaultProfile } from "../src/lib/defaultProfile";
import type { Profile } from "../src/lib/types";

function internProfile(): Profile {
  const p = defaultProfile();
  p.skills = ["Python", "React", "TypeScript", "Node.js", "SQL", "PyTorch"];
  p.preferences.seniority = "internship";
  p.preferences.interests = ["software", "machine learning"];
  p.preferences.locations = ["Remote"];
  return p;
}

function make(text: string, extra: Partial<Parameters<typeof parseJob>[0]> = {}) {
  const job = parseJob({ text, ...extra });
  job.match = matchJob(job, { profile: internProfile() });
  return job;
}

describe("matchJob eligibility", () => {
  it("blocks roles requiring clearance", () => {
    const j = make("Software Engineer Intern. Active security clearance required.");
    expect(j.match!.eligible).toBe(false);
    expect(j.match!.blockers.join(" ")).toMatch(/clearance/i);
  });

  it("blocks roles demanding far more experience than an intern has", () => {
    const j = make("Software Engineer. Minimum of 8 years of experience. Python.");
    expect(j.match!.eligible).toBe(false);
    expect(j.match!.blockers.join(" ")).toMatch(/years/i);
  });

  it("blocks senior roles for an internship seeker", () => {
    const j = make("Senior Staff Engineer role. Python and React.");
    expect(j.match!.eligible).toBe(false);
  });

  it("respects user exclude keywords", () => {
    const p = internProfile();
    p.preferences.excludeKeywords = ["blockchain"];
    const job = parseJob({ text: "Software Engineer Intern building blockchain systems. Python." });
    job.match = matchJob(job, { profile: p });
    expect(job.match!.eligible).toBe(false);
    expect(job.match!.blockers.join(" ")).toMatch(/blockchain/i);
  });
});

describe("matchJob scoring", () => {
  it("scores a strong intern match highly and marks it recommended", () => {
    const j = make(
      [
        "Software Engineer Intern",
        "This is a remote internship in software.",
        "Requirements:",
        "- Python, React, TypeScript, Node.js",
      ].join("\n"),
    );
    expect(j.match!.eligible).toBe(true);
    expect(j.match!.score).toBeGreaterThanOrEqual(60);
    expect(j.match!.recommended).toBe(true);
    expect(j.match!.matchedSkills).toContain("Python");
  });

  it("reports missing skills as concerns", () => {
    const j = make(
      "Software Engineer Intern. Remote. Requirements: Python, Rust, Go, Scala.",
    );
    expect(j.match!.missingSkills).toContain("Rust");
  });
});

describe("rankJobs", () => {
  it("puts eligible/recommended jobs ahead of ineligible ones", () => {
    const strong = make("Software Engineer Intern. Remote. Python, React.");
    const weak = make("Senior Engineer. 10 years experience required. C++.");
    const ranked = rankJobs([weak, strong]);
    expect(ranked[0].id).toBe(strong.id);
  });

  it("breaks score ties by putting the newer posting first", () => {
    const older = make("Software Engineer Intern. Remote. Python, React.");
    const newer = make("Software Engineer Intern. Remote. Python, React.");
    older.createdAt = "2026-01-01T00:00:00.000Z";
    newer.createdAt = "2026-06-01T00:00:00.000Z";
    expect(older.match!.score).toBe(newer.match!.score); // identical inputs
    const ranked = rankJobs([older, newer]);
    expect(ranked[0].id).toBe(newer.id);
  });
});
