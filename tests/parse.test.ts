import { describe, it, expect } from "vitest";
import { parseJob } from "../src/lib/parse";
import { extractSkills } from "../src/lib/skills";

describe("extractSkills", () => {
  it("canonicalizes aliases and word-boundaries", () => {
    const s = extractSkills("Strong in JS, TypeScript, and py. Uses React.js.");
    expect(s).toContain("JavaScript");
    expect(s).toContain("TypeScript");
    expect(s).toContain("Python");
    expect(s).toContain("React");
  });

  it("does not match skills inside unrelated words", () => {
    // "rust" appears inside "trustworthy" — should not match Rust.
    const s = extractSkills("A trustworthy candidate.");
    expect(s).not.toContain("Rust");
  });

  it("recognizes common data/infra/ML tooling", () => {
    const s = extractSkills(
      "Built pipelines with Kafka, Snowflake, and dbt; deployed via GitHub Actions and .NET services.",
    );
    expect(s).toEqual(
      expect.arrayContaining(["Kafka", "Snowflake", "dbt", "GitHub Actions", ".NET"]),
    );
  });
});

describe("parseJob", () => {
  it("splits required vs nice-to-have skills", () => {
    const job = parseJob({
      text: [
        "Software Engineer Intern at Acme",
        "Requirements:",
        "- Python and React",
        "Nice to have:",
        "- Docker and Kubernetes",
      ].join("\n"),
      company: "Acme",
      title: "Software Engineer Intern",
    });
    expect(job.requiredSkills).toContain("Python");
    expect(job.requiredSkills).toContain("React");
    expect(job.niceToHaveSkills).toContain("Docker");
    // Docker is only in the nice-to-have block, so not required.
    expect(job.requiredSkills).not.toContain("Docker");
  });

  it("detects minimum years, clearance, citizenship, sponsorship, seniority", () => {
    const job = parseJob({
      text: [
        "Senior Software Engineer",
        "Requires an active security clearance and U.S. citizenship required.",
        "Minimum of 5 years of experience.",
        "We are unable to sponsor visas.",
      ].join("\n"),
    });
    expect(job.minYearsExperience).toBe(5);
    expect(job.requiresClearance).toBe(true);
    expect(job.requiresCitizenship).toBe(true);
    expect(job.sponsorshipOffered).toBe(false);
    expect(job.seniority).toBe("senior");
  });

  it("detects internship seniority and remote", () => {
    const job = parseJob({
      text: "Software Engineering Internship. This role is fully Remote.",
    });
    expect(job.seniority).toBe("internship");
    expect(job.remote).toBe(true);
  });

  it("picks a positive sponsorship signal", () => {
    const job = parseJob({ text: "Visa sponsorship is available for this role." });
    expect(job.sponsorshipOffered).toBe(true);
  });

  it("detects salary across currencies, ranges, and 'up to' phrasing", () => {
    expect(parseJob({ text: "Compensation: $90,000–$120,000/yr" }).salaryText).toContain(
      "90,000",
    );
    expect(parseJob({ text: "Pay is up to $120k per year." }).salaryText).toMatch(/120k/i);
    expect(parseJob({ text: "Base salary USD 100k - 130k." }).salaryText).toMatch(/100k/i);
    expect(parseJob({ text: "Salary £45,000 per year." }).salaryText).toContain("£45,000");
  });

  it("only counts years tied to experience, not incidental year counts", () => {
    // "within 4 years of graduation" and "4-year degree" are not experience
    // requirements and must not become a blocker.
    const clean = parseJob({
      text: "Open to students graduating within 4 years. A 4-year degree is expected.",
    });
    expect(clean.minYearsExperience).toBeUndefined();

    // A real requirement is still detected, in either phrasing.
    expect(parseJob({ text: "Requires 3+ years of software work." }).minYearsExperience).toBe(3);
    expect(parseJob({ text: "5 years of professional experience." }).minYearsExperience).toBe(5);
    expect(parseJob({ text: "Experience: at least 2 years." }).minYearsExperience).toBe(2);
  });
});
