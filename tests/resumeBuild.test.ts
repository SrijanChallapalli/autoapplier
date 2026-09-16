import { describe, it, expect } from "vitest";
import { buildResumeMarkdown, profileHasResumeContent } from "../src/lib/resumeBuild";
import { defaultProfile } from "../src/lib/defaultProfile";
import type { Profile } from "../src/lib/types";

function full(): Profile {
  const p = defaultProfile();
  p.fullName = "Jordan Lee";
  p.email = "jordan@example.com";
  p.phone = "555-0100";
  p.linkedin = "https://linkedin.com/in/jordan";
  p.university = "Purdue University";
  p.major = "Artificial Intelligence";
  p.degree = "B.S.";
  p.graduationDate = "May 2028";
  p.gpa = "3.9";
  p.skills = ["Python", "React", "TypeScript"];
  p.experience = [
    {
      id: "e1",
      company: "Acme",
      title: "SWE Intern",
      location: "Remote",
      startDate: "2025-06",
      endDate: "2025-08",
      bullets: ["Built a data pipeline", "Shipped a feature"],
    },
  ];
  p.projects = [
    {
      id: "p1",
      name: "CoolApp",
      description: "A cool app",
      link: "https://github.com/x/coolapp",
      bullets: ["Used Next.js"],
    },
  ];
  return p;
}

describe("buildResumeMarkdown", () => {
  it("renders name, contact, education, skills, experience, and projects", () => {
    const md = buildResumeMarkdown(full());
    expect(md).toContain("# Jordan Lee");
    expect(md).toContain("jordan@example.com · 555-0100");
    expect(md).toContain("## Education");
    expect(md).toContain("Purdue University");
    expect(md).toContain("## Skills");
    expect(md).toContain("Python, React, TypeScript");
    expect(md).toContain("## Experience");
    expect(md).toContain("### SWE Intern — Acme (2025-06 – 2025-08)");
    expect(md).toContain("- Built a data pipeline");
    expect(md).toContain("## Projects");
    expect(md).toContain("### [CoolApp](https://github.com/x/coolapp)");
    expect(md).toContain("- Used Next.js");
  });

  it("omits sections with no content and never fabricates", () => {
    const p = defaultProfile();
    p.fullName = "Sam";
    p.skills = ["Go"];
    const md = buildResumeMarkdown(p);
    expect(md).toContain("# Sam");
    expect(md).toContain("## Skills");
    expect(md).not.toContain("## Experience");
    expect(md).not.toContain("## Projects");
    expect(md).not.toContain("## Education");
  });

  it("returns an empty string for a blank profile", () => {
    expect(buildResumeMarkdown(defaultProfile())).toBe("");
  });

  it("handles a missing end date or link gracefully", () => {
    const p = defaultProfile();
    p.experience = [
      { id: "e1", company: "Solo", title: "Founder", startDate: "2024", bullets: [] },
    ];
    p.projects = [{ id: "p1", name: "NoLink", description: "", bullets: [] }];
    const md = buildResumeMarkdown(p);
    expect(md).toContain("### Founder — Solo (2024)");
    expect(md).toContain("### NoLink");
    expect(md).not.toContain("]("); // no broken markdown link
  });

  it("profileHasResumeContent reflects whether there's anything to render", () => {
    expect(profileHasResumeContent(defaultProfile())).toBe(false);
    expect(profileHasResumeContent(full())).toBe(true);
  });
});
