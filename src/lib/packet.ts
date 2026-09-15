import type { Application } from "./types";
import { fmtDateISO } from "./format";

// Build a plain-text/markdown application packet the user can copy straight
// into a portal. Everything here is already-reviewed data from the application.
export function buildPacket(app: Application): string {
  const L: string[] = [];
  L.push(`# Application — ${app.title} @ ${app.company}`);
  L.push("");
  L.push(`- Company: ${app.company}`);
  L.push(`- Position: ${app.title}`);
  if (app.location) L.push(`- Location: ${app.location}`);
  if (app.jobUrl) L.push(`- Posting: ${app.jobUrl}`);
  if (app.resumeLabel) L.push(`- Resume: ${app.resumeLabel}`);
  L.push(`- Confidence: ${app.confidence}`);
  L.push(`- Prepared: ${fmtDateISO(app.createdAt)}`);
  L.push("");

  L.push("## Why this is a good match");
  L.push(app.matchSummary || "—");
  L.push("");

  if (app.keyRequirements.length) {
    L.push("## Key requirements");
    for (const r of app.keyRequirements) L.push(`- ${r}`);
    L.push("");
  }

  L.push("## Application answers");
  for (const a of app.answers) {
    L.push(`**${a.question}**${a.unusual ? "  _(review)_" : ""}`);
    L.push(a.answer);
    L.push("");
  }

  if (app.tailoredResume && app.tailoredResume.trim()) {
    L.push("## Tailored resume");
    L.push(app.tailoredResume.trim());
    L.push("");
  }

  if (app.coverLetter && app.coverLetter.trim()) {
    L.push("## Cover letter");
    L.push(app.coverLetter.trim());
    L.push("");
  }

  if (app.openQuestions.length) {
    L.push("## Still needs answers");
    for (const q of app.openQuestions) L.push(`- ${q}`);
    L.push("");
  }

  return L.join("\n").trim() + "\n";
}
