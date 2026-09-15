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
    expect(first.bullets.length).toBeGreaterThanOrEqual(2);
    expect(first.endDate).toBeTruthy();
  });

  it("extracts projects", () => {
    expect(p.projects?.length).toBe(1);
    expect(p.projects![0].name).toMatch(/ResumeRank/);
    expect(p.projects![0].link).toMatch(/github\.com\/jlee\/resumerank/);
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
