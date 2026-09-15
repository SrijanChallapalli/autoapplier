import { describe, it, expect } from "vitest";
import { analyzeFlags } from "../src/lib/flags";
import { parseJob } from "../src/lib/parse";
import { matchJob } from "../src/lib/matching";
import { prepareApplication } from "../src/lib/prepare";
import { defaultProfile } from "../src/lib/defaultProfile";
import type { Profile } from "../src/lib/types";

function profile(): Profile {
  const p = defaultProfile();
  p.fullName = "Test User";
  p.email = "t@example.com";
  p.skills = ["Python", "React", "TypeScript", "Node.js", "SQL"];
  p.preferences.seniority = "internship";
  p.preferences.interests = ["software"];
  return p;
}

function prep(text: string, over = {}) {
  const p = profile();
  const job = { ...parseJob({ text, company: "Acme", title: "SWE Intern" }), ...over };
  job.match = matchJob(job, { profile: p });
  const app = prepareApplication(job, p);
  return { report: analyzeFlags(job, p, app), job, app };
}

describe("analyzeFlags", () => {
  it("gives green flags for a strong, eligible match", () => {
    const { report } = prep(
      "Software Engineer Intern. Remote. Requirements: Python, React, TypeScript, Node.js.",
    );
    const green = report.flags.filter((f) => f.level === "green");
    expect(green.length).toBeGreaterThan(0);
    expect(green.some((f) => /skill match|hard requirements/i.test(f.title))).toBe(true);
  });

  it("gives a red flag for a hard blocker", () => {
    const { report } = prep(
      "Software Engineer Intern. Active security clearance required. Python.",
    );
    const red = report.flags.filter((f) => f.level === "red");
    expect(red.some((f) => /clearance/i.test(f.title))).toBe(true);
  });

  it("flags a not-yet-tailored resume as yellow", () => {
    const { report } = prep(
      "Software Engineer Intern. Remote. Requirements: Python, React.",
    );
    expect(
      report.flags.some((f) => f.level === "yellow" && /tailored/i.test(f.title)),
    ).toBe(true);
  });

  it("lists missing keywords and ATS suggestions", () => {
    const { report } = prep(
      "Software Engineer Intern. Remote. Requirements: Python, Rust, Go, Kubernetes.",
    );
    expect(report.missingKeywords).toEqual(
      expect.arrayContaining(["Rust", "Go", "Kubernetes"]),
    );
    expect(report.atsSuggestions.length).toBeGreaterThan(3);
    expect(report.atsSuggestions.join(" ")).toMatch(/keyword/i);
    expect(report.atsScore).toBeGreaterThanOrEqual(0);
    expect(report.atsScore).toBeLessThanOrEqual(100);
  });
});
