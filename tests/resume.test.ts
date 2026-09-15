import { describe, it, expect } from "vitest";
import { parseResumeStructured, mergeExtracted } from "../src/lib/resume";

const RESUME = `Jordan Lee
Austin, TX | jordan@example.com | github.com/jlee | linkedin.com/in/jlee

EDUCATION
State University — B.S. Computer Science, Expected 2027
GPA: 3.8

SKILLS
Python, TypeScript, React, Node.js, PyTorch, Docker, AWS

EXPERIENCE
Software Engineering Intern at Acme Corp   Jun 2024 - Aug 2024
- Built React and Node.js features used by 5k users
- Wrote REST APIs and PostgreSQL queries

Research Assistant at Campus Lab   2025 - Present
- Trained models with PyTorch and scikit-learn

PROJECTS
ResumeRank — https://github.com/jlee/resumerank
- Embeddings-based matcher in TypeScript
`;

describe("parseResumeStructured", () => {
  const p = parseResumeStructured(RESUME);

  it("extracts name, contact, and links", () => {
    expect(p.fullName).toBe("Jordan Lee");
    expect(p.email).toBe("jordan@example.com");
    expect(p.github).toMatch(/github\.com\/jlee/);
    expect(p.linkedin).toMatch(/linkedin\.com\/in\/jlee/);
    expect(p.location).toBe("Austin, TX");
  });

  it("extracts education", () => {
    expect(p.university).toMatch(/State University/);
    expect(p.major).toMatch(/Computer Science/i);
    expect(p.graduationDate).toBe("2027");
    expect(p.gpa).toBe("3.8");
  });

  it("extracts skills", () => {
    expect(p.skills).toContain("Python");
    expect(p.skills).toContain("PyTorch");
  });

  it("extracts experience with titles, companies, and bullets", () => {
    expect(p.experience?.length).toBe(2);
    const first = p.experience![0];
    expect(first.title).toMatch(/Software Engineering Intern/);
    expect(first.company).toMatch(/Acme Corp/);
    expect(first.bullets?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(first.endDate).toBeTruthy();
  });

  it("extracts projects", () => {
    expect(p.projects?.length).toBe(1);
    expect(p.projects![0].name).toMatch(/ResumeRank/);
    expect(p.projects![0].link).toMatch(/github\.com\/jlee\/resumerank/);
  });
});

describe("parseResumeStructured — no blank lines (PDF-like)", () => {
  // PDF text extraction often drops the blank lines between entries.
  const packed = `Sam Rivera
sam@example.com
EXPERIENCE
Software Engineer Intern at Acme Corp   Jun 2024 - Aug 2024
- Built React features
- Wrote REST APIs
Data Analyst at Insight Labs   2023 - 2024
- Built dashboards in SQL
PROJECTS
TradeBot https://github.com/sam/tradebot
- Trading simulator in TypeScript`;

  it("still splits multiple experiences without blank separators", () => {
    const p = parseResumeStructured(packed);
    expect(p.experience?.length).toBe(2);
    expect(p.experience![0].title).toMatch(/Software Engineer Intern/);
    expect(p.experience![0].company).toMatch(/Acme Corp/);
    expect(p.experience![1].title).toMatch(/Data Analyst/);
    expect(p.experience![1].company).toMatch(/Insight Labs/);
    expect(p.projects?.length).toBe(1);
    expect(p.projects![0].name).toMatch(/TradeBot/);
  });
});

describe("parseResumeStructured — PDF column layout (tab markers)", () => {
  // Mimics reconstructed PDF text: right-aligned location/dates become tabs,
  // bullets wrap onto continuation lines, sections are all-caps, and a trailing
  // INTERESTS line follows PROJECTS.
  const pdf = [
    "Jordan Lee",
    "jordan@example.com | 555-123-4567 | github.com/jlee",
    "EDUCATION",
    "Purdue University\tWest Lafayette, IN",
    "B.S. in Artificial Intelligence\tAug. 2025 – May 2028 (Expected)",
    "TECHNICAL SKILLS",
    "Languages: Python, TypeScript, Rust",
    "EXPERIENCE",
    "MergeWorks\tRemote",
    "Software Engineer Intern\tMay 2026 – Present",
    "• Built a pipeline that turns messy financial packets into audit-ready",
    "analysis, replacing hours of manual review.",
    "Cosmos Granite & Marble\tChantilly, VA",
    "Software Engineer Intern\tMay 2025 – Aug. 2025",
    "• Built a Python data-collection tool that surfaced 1,000+ competitors",
    "across target states.",
    "PROJECTS",
    "ChitYap: Swift, SwiftUI, Supabase",
    "• Co-built a native SwiftUI iOS app on Supabase.",
    "INTERESTS Badminton, Poker, Hiking, Video Games",
  ].join("\n");

  const p = parseResumeStructured(pdf);

  it("cleanly separates company from right-aligned location", () => {
    expect(p.experience?.length).toBe(2);
    expect(p.experience![0]).toMatchObject({
      title: "Software Engineer Intern",
      company: "MergeWorks",
    });
    expect(p.experience![1].company).toBe("Cosmos Granite & Marble");
  });

  it("merges wrapped bullet lines into one bullet", () => {
    expect(p.experience![0].bullets?.length).toBe(1);
    expect(p.experience![0].bullets![0]).toMatch(/manual review\.$/);
  });

  it("parses education from the column layout", () => {
    expect(p.university).toBe("Purdue University");
    expect(p.major).toMatch(/Artificial Intelligence/);
    expect(p.graduationDate).toMatch(/2028/);
  });

  it("stops at INTERESTS so it isn't parsed as a project", () => {
    expect(p.projects?.length).toBe(1);
    expect(p.projects![0].name).toBe("ChitYap");
    expect(
      p.projects!.some((pr) => /Badminton|INTERESTS/i.test(pr.name ?? "")),
    ).toBe(false);
  });
});

describe("mergeExtracted", () => {
  it("prefers primary but backfills from secondary", () => {
    const merged = mergeExtracted(
      { fullName: "AI Name", skills: ["Python"] },
      { fullName: "Text Name", email: "x@y.com", skills: ["Rust"], university: "Uni" },
    );
    expect(merged.fullName).toBe("AI Name"); // primary wins
    expect(merged.email).toBe("x@y.com"); // backfilled
    expect(merged.university).toBe("Uni"); // backfilled
    expect(merged.skills).toEqual(expect.arrayContaining(["Python", "Rust"]));
  });
});
