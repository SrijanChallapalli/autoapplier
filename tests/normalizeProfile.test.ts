import { describe, it, expect } from "vitest";
import { normalizeProfile, defaultProfile } from "../src/lib/defaultProfile";
import { matchJob } from "../src/lib/matching";
import { parseJob } from "../src/lib/parse";

describe("normalizeProfile", () => {
  it("returns a valid default-shaped profile for null/garbage input", () => {
    for (const bad of [null, undefined, 42, "hello", [], true]) {
      const p = normalizeProfile(bad);
      expect(Array.isArray(p.skills)).toBe(true);
      expect(Array.isArray(p.experience)).toBe(true);
      expect(Array.isArray(p.projects)).toBe(true);
      expect(Array.isArray(p.resumes)).toBe(true);
      expect(p.preferences).toBeTruthy();
      expect(Array.isArray(p.preferences.locations)).toBe(true);
      expect(p.authorization).toBeTruthy();
    }
  });

  it("coerces non-array collection fields to empty arrays", () => {
    const p = normalizeProfile({
      skills: "Python",
      experience: null,
      projects: 5,
      resumes: {},
    });
    expect(p.skills).toEqual([]);
    expect(p.experience).toEqual([]);
    expect(p.projects).toEqual([]);
    expect(p.resumes).toEqual([]);
  });

  it("keeps valid skills and trims/filters junk entries", () => {
    const p = normalizeProfile({ skills: ["Python", "  React  ", "", 3, null] });
    expect(p.skills).toEqual(["Python", "React"]);
  });

  it("fills nested experience/project fields with safe defaults", () => {
    const p = normalizeProfile({
      experience: [{ company: "Acme" }],
      projects: [{ name: "Thing" }],
    });
    expect(p.experience[0].company).toBe("Acme");
    expect(p.experience[0].bullets).toEqual([]);
    expect(typeof p.experience[0].id).toBe("string");
    expect(p.projects[0].name).toBe("Thing");
    expect(p.projects[0].bullets).toEqual([]);
  });

  it("falls back on an invalid seniority and coerces booleans", () => {
    const p = normalizeProfile({
      preferences: { seniority: "principal", willingToRelocate: "yes" },
    });
    expect(p.preferences.seniority).toBe(defaultProfile().preferences.seniority);
    // "yes" is not a boolean -> falls back to the default (true)
    expect(p.preferences.willingToRelocate).toBe(true);
  });

  it("drops non-string savedAnswers values", () => {
    const p = normalizeProfile({
      savedAnswers: { a: "yes", b: 5, c: null, d: "no" },
    });
    expect(p.savedAnswers).toEqual({ a: "yes", d: "no" });
  });

  it("only keeps a finite numeric minSalary", () => {
    expect(normalizeProfile({ preferences: { minSalary: 50000 } }).preferences.minSalary).toBe(50000);
    expect(normalizeProfile({ preferences: { minSalary: "lots" } }).preferences.minSalary).toBeUndefined();
    expect(normalizeProfile({ preferences: { minSalary: NaN } }).preferences.minSalary).toBeUndefined();
  });

  it("preserves a fully-populated valid profile without dropping data", () => {
    const p = {
      ...defaultProfile(),
      fullName: "Jordan Lee",
      email: "jordan@example.com",
      phone: "555-0100",
      university: "State U",
      major: "CS",
      gpa: "3.8",
      authorization: {
        workAuthorization: "US Citizen",
        requiresSponsorshipNow: false,
        requiresSponsorshipFuture: true,
      },
      preferences: {
        roles: ["SWE Intern"],
        interests: ["ML"],
        locations: ["Remote", "NYC"],
        countries: ["United States"],
        willingToRelocate: false,
        minSalary: 90000,
        excludeKeywords: ["clearance"],
        seniority: "new-grad" as const,
      },
      skills: ["Python", "TypeScript"],
      experience: [
        {
          id: "e1",
          company: "Acme",
          title: "Intern",
          location: "Remote",
          startDate: "2024-06",
          endDate: "2024-08",
          bullets: ["Built X", "Shipped Y"],
          tags: ["backend"],
        },
      ],
      projects: [
        { id: "p1", name: "Thing", description: "A thing", link: "http://x", bullets: ["Did Z"], tags: ["ml"] },
      ],
      resumes: [
        { id: "r1", label: "Backend", fileName: "backend.pdf", focus: ["python"], notes: "n" },
      ],
      savedAnswers: { "years of python": "3" },
    };
    const out = normalizeProfile(p);
    // updatedAt is intentionally re-derived; everything else must survive.
    expect({ ...out, updatedAt: p.updatedAt }).toEqual(p);
  });

  it("produces a profile the matcher can score without crashing", () => {
    // The whole point: a malformed profile must not crash downstream matching.
    const p = normalizeProfile({ skills: "not-an-array", experience: "broken" });
    const job = parseJob({ text: "Software Engineer Intern. Remote. Python, React." });
    expect(() => matchJob(job, { profile: p })).not.toThrow();
  });
});
