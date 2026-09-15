import { describe, it, expect } from "vitest";
import { htmlToText } from "../src/lib/html";
import { parseResume } from "../src/lib/resume";
import { buildPacket } from "../src/lib/packet";
import { isRelevant, dedupePostings, type RawPosting } from "../src/lib/sources";
import { coreRole, buildNetworkingLinks } from "../src/lib/networking";
import { daysUntil, relativeDay } from "../src/lib/format";
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

describe("dedupePostings", () => {
  const p = (over: Partial<RawPosting>): RawPosting => ({
    company: "Acme",
    title: "SWE Intern",
    text: "role",
    ...over,
  });

  it("collapses duplicates by URL ignoring query/hash/trailing slash", () => {
    const out = dedupePostings([
      p({ url: "https://jobs.acme.com/1" }),
      p({ url: "https://jobs.acme.com/1/" }),
      p({ url: "https://jobs.acme.com/1?utm=x#top" }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("collapses URL-less duplicates by company + title, first wins", () => {
    const out = dedupePostings([
      p({ title: "SWE  Intern", text: "first" }),
      p({ title: "swe intern", text: "second" }),
      p({ company: "Beta", title: "SWE Intern" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].text).toBe("first");
  });
});

describe("networking", () => {
  it("reduces a noisy title to a core role", () => {
    expect(coreRole("Software Engineer Intern (Summer 2027)")).toMatch(
      /software engineer/i,
    );
    expect(coreRole("Senior Machine Learning Engineer")).toMatch(
      /machine learning engineer/i,
    );
  });

  it("builds recruiter/role links and an alumni link when a school is given", () => {
    const links = buildNetworkingLinks("Acme", "SWE Intern", "State University");
    expect(links.length).toBeGreaterThanOrEqual(4);
    expect(links.every((l) => l.url.startsWith("https://"))).toBe(true);
    expect(links.some((l) => /recruiter/i.test(l.label))).toBe(true);
    expect(links.some((l) => /alumni/i.test(l.label))).toBe(true);
    // Company name is encoded into every LinkedIn search.
    expect(
      links.filter((l) => l.url.includes("linkedin.com")).every((l) =>
        l.url.includes("Acme"),
      ),
    ).toBe(true);
  });

  it("omits the alumni link when no school is known", () => {
    const links = buildNetworkingLinks("Acme", "SWE Intern");
    expect(links.some((l) => /alumni/i.test(l.label))).toBe(false);
  });
});

describe("relative dates", () => {
  const now = new Date("2026-09-15T12:00:00Z");

  it("counts whole calendar days regardless of time of day", () => {
    expect(daysUntil("2026-09-18T01:00:00Z", now)).toBe(3);
    expect(daysUntil("2026-09-13T23:00:00Z", now)).toBe(-2);
    expect(daysUntil(undefined, now)).toBeUndefined();
    expect(daysUntil("not-a-date", now)).toBeUndefined();
  });

  it("renders friendly relative labels", () => {
    expect(relativeDay("2026-09-15T20:00:00Z", now)).toBe("today");
    expect(relativeDay("2026-09-16T00:00:00Z", now)).toBe("tomorrow");
    expect(relativeDay("2026-09-14T00:00:00Z", now)).toBe("yesterday");
    expect(relativeDay("2026-09-20T00:00:00Z", now)).toBe("in 5 days");
    expect(relativeDay("2026-09-10T00:00:00Z", now)).toBe("5 days ago");
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
