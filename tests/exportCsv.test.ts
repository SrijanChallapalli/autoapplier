import { describe, it, expect } from "vitest";
import { applicationsToCsv, csvField } from "../src/lib/exportCsv";
import type { Application } from "../src/lib/types";

function app(over: Partial<Application> = {}): Application {
  return {
    id: "a1",
    jobId: "j1",
    company: "Acme",
    title: "SWE Intern",
    status: "submitted",
    confidence: "high",
    answers: [],
    openQuestions: [],
    matchSummary: "",
    keyRequirements: [],
    interviewStages: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

describe("csvField", () => {
  it("leaves plain values untouched", () => {
    expect(csvField("Acme")).toBe("Acme");
  });
  it("quotes and escapes commas, quotes, and newlines", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
  });
  it("neutralizes spreadsheet formula injection", () => {
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("@cmd")).toBe("'@cmd");
  });
});

describe("applicationsToCsv", () => {
  it("emits a header row plus one row per application", () => {
    const csv = applicationsToCsv([app(), app({ company: "Globex" })]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Company");
    expect(lines[0]).toContain("Date applied");
    expect(lines[1].startsWith("Acme,")).toBe(true);
    expect(lines[2].startsWith("Globex,")).toBe(true);
  });

  it("formats dates as YYYY-MM-DD and counts stages", () => {
    const csv = applicationsToCsv([
      app({
        dateApplied: "2026-09-10T12:00:00.000Z",
        interviewStages: [
          { name: "Screen", outcome: "passed" },
          { name: "Onsite", outcome: "pending" },
        ],
      }),
    ]);
    const row = csv.split("\r\n")[1];
    expect(row).toContain("2026-09-10");
    // interview-stages column should read 2
    expect(row.split(",")).toContain("2");
  });

  it("escapes a comma in a job title without breaking the row", () => {
    const csv = applicationsToCsv([
      app({ title: "Engineer, Backend", location: "Remote" }),
    ]);
    const row = csv.split("\r\n")[1];
    expect(row).toContain('"Engineer, Backend"');
  });

  it("handles an empty list (header only)", () => {
    const csv = applicationsToCsv([]);
    expect(csv.split("\r\n")).toHaveLength(1);
  });
});
