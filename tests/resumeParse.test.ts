import { describe, it, expect } from "vitest";
import { parseResumeDoc } from "../src/lib/resumeParse";

const CANONICAL = `# Srijan Challapalli
srijan@example.com | (703) 944-4106 | linkedin.com/in/srijan | github.com/srijan

## Education
### Purdue University | West Lafayette, IN
B.S. in Artificial Intelligence | Aug 2024 – May 2028

## Experience
### Software Engineer Intern | May 2025 – Aug 2025
Acme Corp | Remote
- Built a REST API in Python serving 10k requests/day
- Cut latency 40% by adding caching

## Projects
### ChitYap | TypeScript, React
- Shipped a realtime chat app

## Technical Skills
Languages: Python, TypeScript, SQL
Frameworks: React, Node.js`;

describe("parseResumeDoc", () => {
  it("parses name and contact items", () => {
    const d = parseResumeDoc(CANONICAL);
    expect(d.name).toBe("Srijan Challapalli");
    expect(d.contact).toEqual([
      "srijan@example.com",
      "(703) 944-4106",
      "linkedin.com/in/srijan",
      "github.com/srijan",
    ]);
  });

  it("parses sections in order with correct headings", () => {
    const d = parseResumeDoc(CANONICAL);
    expect(d.sections.map((s) => s.heading)).toEqual([
      "Education",
      "Experience",
      "Projects",
      "Technical Skills",
    ]);
  });

  it("splits entry heading into left/right and captures subtitle + bullets", () => {
    const d = parseResumeDoc(CANONICAL);
    const exp = d.sections.find((s) => s.heading === "Experience")!;
    expect(exp.entries).toHaveLength(1);
    const e = exp.entries[0];
    expect(e.title).toBe("Software Engineer Intern");
    expect(e.titleRight).toBe("May 2025 – Aug 2025");
    expect(e.subtitle).toBe("Acme Corp");
    expect(e.subtitleRight).toBe("Remote");
    expect(e.bullets).toHaveLength(2);
    expect(e.bullets[0]).toContain("REST API");
  });

  it("parses skills as labelled lines", () => {
    const d = parseResumeDoc(CANONICAL);
    const skills = d.sections.find((s) => s.heading === "Technical Skills")!;
    expect(skills.lines[0]).toEqual({
      label: "Languages:",
      text: "Python, TypeScript, SQL",
    });
  });

  it("peels a trailing date range when no pipe separator is used", () => {
    const d = parseResumeDoc(
      `# X\nx@y.com\n\n## Experience\n### Engineer at Foo May 2024 – Aug 2024\n- did work`,
    );
    const e = d.sections[0].entries[0];
    expect(e.title).toBe("Engineer at Foo");
    expect(e.titleRight).toBe("May 2024 – Aug 2024");
  });

  it("folds a stray second '###' line into the entry subtitle (real local-model output)", () => {
    // llama3.1 sometimes puts the company/degree line on its own '### ' header.
    const messy = `# Srijan Challapalli
srijan@example.com | 703-944-4106

## Education
### Purdue University | West Lafayette, IN
### B.S. in Artificial Intelligence | 2028

## Experience
### Software Engineer Intern | MergeWorks
### May 2026 – Present
- Built an M&A pipeline`;
    const d = parseResumeDoc(messy);
    const edu = d.sections.find((s) => s.heading === "Education")!;
    expect(edu.entries).toHaveLength(1);
    expect(edu.entries[0].title).toBe("Purdue University");
    expect(edu.entries[0].titleRight).toBe("West Lafayette, IN");
    expect(edu.entries[0].subtitle).toBe("B.S. in Artificial Intelligence");
    expect(edu.entries[0].subtitleRight).toBe("2028");

    const exp = d.sections.find((s) => s.heading === "Experience")!;
    expect(exp.entries).toHaveLength(1);
    expect(exp.entries[0].title).toBe("Software Engineer Intern");
    expect(exp.entries[0].subtitle).toBe("May 2026 – Present");
    expect(exp.entries[0].bullets).toHaveLength(1);
  });

  it("is tolerant of ALL-CAPS section headers and '*' bullets", () => {
    const d = parseResumeDoc(
      `# X\nx@y.com\n\nEXPERIENCE\n### Dev | 2024\n* shipped it`,
    );
    expect(d.sections[0].heading).toBe("EXPERIENCE");
    expect(d.sections[0].entries[0].bullets[0]).toBe("shipped it");
  });
});
