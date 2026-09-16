// ---------------------------------------------------------------------------
// CSV export for the application tracker.
//
// Job seekers routinely need their pipeline as a spreadsheet — to report to a
// career-services office, share with a mentor, or keep their own records. This
// turns the applications into a clean, correctly-escaped CSV. Pure and
// dependency-free so it runs anywhere and is easy to test.
// ---------------------------------------------------------------------------

import type { Application } from "./types";
import { fmtDateISO } from "./format";

const COLUMNS: { header: string; value: (a: Application) => string }[] = [
  { header: "Company", value: (a) => a.company },
  { header: "Title", value: (a) => a.title },
  { header: "Location", value: (a) => a.location ?? "" },
  { header: "Status", value: (a) => a.status },
  { header: "Confidence", value: (a) => a.confidence },
  { header: "Resume", value: (a) => a.resumeLabel ?? "" },
  { header: "Date applied", value: (a) => (a.dateApplied ? fmtDateISO(a.dateApplied) : "") },
  { header: "Follow-up", value: (a) => (a.followUpDate ? fmtDateISO(a.followUpDate) : "") },
  { header: "Interview stages", value: (a) => String(a.interviewStages.length) },
  { header: "Recruiter", value: (a) => a.recruiter?.name ?? "" },
  { header: "Job URL", value: (a) => a.jobUrl ?? "" },
  { header: "Open questions", value: (a) => String(a.openQuestions.length) },
  { header: "Notes", value: (a) => a.notes ?? "" },
];

// Escape a single field per RFC 4180: wrap in quotes when it contains a comma,
// quote, or newline, and double any embedded quotes. A leading =/+/-/@ is
// prefixed with a single quote to neutralize spreadsheet formula injection.
export function csvField(raw: string): string {
  let s = raw ?? "";
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function applicationsToCsv(apps: Application[]): string {
  const rows = [COLUMNS.map((c) => c.header).join(",")];
  for (const a of apps) {
    rows.push(COLUMNS.map((c) => csvField(c.value(a))).join(","));
  }
  return rows.join("\r\n");
}
