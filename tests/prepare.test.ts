import { describe, it, expect } from "vitest";
import {
  prepareApplication,
  isDuplicate,
  pickBestPerCompany,
} from "../src/lib/prepare";
import { parseJob } from "../src/lib/parse";
import { matchJob } from "../src/lib/matching";
import { defaultProfile } from "../src/lib/defaultProfile";
import type { Job, Profile } from "../src/lib/types";

function profile(): Profile {
  const p = defaultProfile();
  p.fullName = "Test User";
  p.email = "test@example.com";
  p.skills = ["Python", "React"];
  p.preferences.seniority = "internship";
  return p;
}

function job(text: string, over: Partial<Job> = {}): Job {
  const j = parseJob({ text, company: over.company, title: over.title });
  j.match = matchJob(j, { profile: profile() });
  return { ...j, ...over };
}

describe("prepareApplication", () => {
  it("fills standard answers from the profile", () => {
    const j = job("Software Engineer Intern. Remote. Python, React.");
    const app = prepareApplication(j, profile());
    const qs = app.answers.map((a) => a.question);
    expect(qs).toContain("Full name");
    expect(qs).toContain("Email");
    const name = app.answers.find((a) => a.question === "Full name");
    expect(name?.answer).toBe("Test User");
  });

  it("flags salary/essay questions as open items instead of guessing", () => {
    const j = job(
      [
        "Software Engineer Intern. Remote. Python.",
        "What are your salary expectations?",
        "Describe a time you solved a hard problem in 300 words.",
      ].join("\n"),
    );
    const app = prepareApplication(j, profile());
    expect(app.openQuestions.length).toBeGreaterThanOrEqual(1);
    expect(app.openQuestions.join(" ")).toMatch(/salary|essay/i);
  });

  it("does not mark an application ready when open questions remain", () => {
    const j = job("Software Engineer Intern. Remote. Python, React. What are your salary expectations?");
    const app = prepareApplication(j, profile());
    expect(app.status).not.toBe("ready");
  });
});

describe("dedup helpers", () => {
  it("detects duplicate by URL", () => {
    const j = job("SWE Intern", { company: "Acme", title: "SWE Intern" });
    j.url = "https://x.com/1";
    expect(
      isDuplicate(j, [{ company: "Acme", title: "Different", jobUrl: "https://x.com/1" }]),
    ).toBe(true);
  });

  it("detects duplicate by same company + near-identical title", () => {
    const j = job("SWE Intern", { company: "Acme", title: "Software Engineer Intern" });
    expect(
      isDuplicate(j, [{ company: "Acme", title: "Software Engineer Intern" }]),
    ).toBe(true);
  });

  it("keeps the best-scoring role among similar ones at a company", () => {
    const a = job("Software Engineer Intern. Python, React. Remote.", {
      company: "Acme",
      title: "Software Engineer Intern",
    });
    const b = job("Software Engineer Intern II. Python.", {
      company: "Acme",
      title: "Software Engineer Intern II",
    });
    a.match!.score = 90;
    b.match!.score = 40;
    const { keep, supersededBy } = pickBestPerCompany([a, b]);
    expect(keep).toHaveLength(1);
    expect(keep[0].id).toBe(a.id);
    expect(supersededBy[b.id]).toBe(a.id);
  });
});
