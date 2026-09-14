import { describe, it, expect } from "vitest";
import { htmlToText } from "../src/lib/html";
import { parseResume } from "../src/lib/resume";
import { buildPacket } from "../src/lib/packet";
import { isRelevant, type RawPosting } from "../src/lib/sources";
import type { Application } from "../src/lib/types";

describe("htmlToText", () => {
  it("decodes entity-escaped Greenhouse HTML and strips tags", () => {
    const input =
      "&lt;div&gt;&lt;p&gt;We use &lt;strong&gt;Python&lt;/strong&gt; &amp; React&lt;/p&gt;&lt;ul&gt;&lt;li&gt;REST&lt;/li&gt;&lt;/ul&gt;&lt;/div&gt;";
    const out = htmlToText(input);
    expect(out).toContain("Python");
    expect(out).toContain("&"); // &amp; decoded
    expect(out).toContain("REST");
    expect(out).not.toContain("<");
    expect(out).not.toContain("&lt;");
  });
});

describe("parseResume", () => {
  it("extracts skills, emails, and links from resume text", () => {
    const text = `Jane Roe
jane@example.com  https://github.com/jane
Skills: Python, TypeScript, PyTorch, Docker`;
    const r = parseResume(text);
    expect(r.skills).toContain("Python");
    expect(r.skills).toContain("PyTorch");
    expect(r.emails).toContain("jane@example.com");
    expect(r.links.some((l) => l.includes("github.com/jane"))).toBe(true);
    expect(r.chars).toBeGreaterThan(0);
  });
});

describe("isRelevant", () => {
  const post = (title: string, text = "software engineering role"): RawPosting => ({
    company: "Acme",
    title,
    text,
  });

  it("keeps intern/early-career tech titles", () => {
    expect(isRelevant(post("Software Engineer Intern"), {})).toBe(true);
    expect(isRelevant(post("Machine Learning Intern"), {})).toBe(true);
    expect(isRelevant(post("Software Engineer, Early Career"), {})).toBe(true);
  });

  it("drops non-engineering roles even if early-career", () => {
    expect(isRelevant(post("Recruiter, Early Career"), {})).toBe(false);
    expect(isRelevant(post("University Grad, Sales"), {})).toBe(false);
  });

  it("drops full-time senior roles when intern-only", () => {
    expect(isRelevant(post("Senior Software Engineer"), {})).toBe(false);
  });

  it("respects an explicit keyword filter", () => {
    expect(
      isRelevant(post("Software Engineer Intern", "backend python role"), {
        keywords: ["python"],
      }),
    ).toBe(true);
    expect(
      isRelevant(post("Software Engineer Intern", "frontend react role"), {
        keywords: ["golang"],
      }),
    ).toBe(false);
  });
});

describe("buildPacket", () => {
  it("renders company, position, and answers", () => {
    const app: Application = {
      id: "app_1",
      jobId: "job_1",
      company: "Acme",
      title: "SWE Intern",
      location: "Remote",
      status: "ready",
      confidence: "high",
      resumeLabel: "General SWE",
      answers: [
        { question: "Full name", answer: "Jane Roe", source: "profile", unusual: false },
        { question: "Salary?", answer: "Flexible", source: "user", unusual: true },
      ],
      openQuestions: [],
      matchSummary: "Strong fit.",
      keyRequirements: ["Python"],
      interviewStages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const md = buildPacket(app);
    expect(md).toContain("Acme");
    expect(md).toContain("SWE Intern");
    expect(md).toContain("Jane Roe");
    expect(md).toContain("General SWE");
    expect(md).toContain("Python");
  });
});
