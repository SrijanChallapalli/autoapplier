import { diffLines } from "diff";

// ---------------------------------------------------------------------------
// Line-level diffing for the resume editor's "review" mode.
//
// We compute the diff between the user's current resume and the AI's proposed
// rewrite ourselves (rather than asking the model for structured edits, which a
// small local model does unreliably). Each changed hunk becomes an approve/
// reject decision; applyHunks rebuilds the resume from the accepted ones.
// ---------------------------------------------------------------------------

export type HunkKind = "context" | "change" | "add" | "del";

export interface Hunk {
  id: number;
  kind: HunkKind;
  before: string[]; // original lines (context / change / del)
  after: string[]; // proposed lines (context / change / add)
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
}

// Split a diff part's value into lines, dropping the single trailing empty
// string that a trailing newline produces.
function toLines(value: string): string[] {
  const lines = value.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// Compute an ordered list of hunks. Adjacent removed+added parts are paired
// into a single "change" hunk so the UI shows before/after together.
export function computeHunks(oldText: string, newText: string): Hunk[] {
  const parts = diffLines(normalize(oldText), normalize(newText));
  const hunks: Hunk[] = [];
  let id = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.removed) {
      const next = parts[i + 1];
      if (next && next.added) {
        hunks.push({
          id: id++,
          kind: "change",
          before: toLines(part.value),
          after: toLines(next.value),
        });
        i++; // consume the paired added part
      } else {
        hunks.push({ id: id++, kind: "del", before: toLines(part.value), after: [] });
      }
    } else if (part.added) {
      hunks.push({ id: id++, kind: "add", before: [], after: toLines(part.value) });
    } else {
      const lines = toLines(part.value);
      hunks.push({ id: id++, kind: "context", before: lines, after: lines });
    }
  }
  return hunks;
}

// The hunks that require a decision (everything except unchanged context).
export function changedHunks(hunks: Hunk[]): Hunk[] {
  return hunks.filter((h) => h.kind !== "context");
}

// Rebuild the resume text. Context is always kept; a changed hunk uses its
// proposed lines when accepted and its original lines when rejected.
export function applyHunks(hunks: Hunk[], accepted: Set<number>): string {
  const out: string[] = [];
  for (const h of hunks) {
    switch (h.kind) {
      case "context":
        out.push(...h.before);
        break;
      case "change":
        out.push(...(accepted.has(h.id) ? h.after : h.before));
        break;
      case "add":
        if (accepted.has(h.id)) out.push(...h.after);
        break;
      case "del":
        if (!accepted.has(h.id)) out.push(...h.before);
        break;
    }
  }
  return out.join("\n");
}
