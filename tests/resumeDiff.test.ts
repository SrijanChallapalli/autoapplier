import { describe, it, expect } from "vitest";
import { computeHunks, changedHunks, applyHunks } from "../src/lib/resumeDiff";

const OLD = `John Doe
john@example.com

EXPERIENCE
- Built a REST API in Python
- Wrote tests

EDUCATION
- BS Computer Science`;

describe("resume diff", () => {
  it("finds no changes for identical text", () => {
    const hunks = computeHunks(OLD, OLD);
    expect(changedHunks(hunks)).toHaveLength(0);
    expect(applyHunks(hunks, new Set())).toBe(OLD.replace(/\r\n/g, "\n"));
  });

  it("detects a changed line and applies it only when accepted", () => {
    const next = OLD.replace(
      "- Built a REST API in Python",
      "- Built and scaled a REST API in Python serving 10k users",
    );
    const hunks = computeHunks(OLD, next);
    const changes = changedHunks(hunks);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("change");

    // Rejected -> original preserved
    expect(applyHunks(hunks, new Set())).toBe(OLD.replace(/\r\n/g, "\n"));
    // Accepted -> new text applied
    expect(applyHunks(hunks, new Set([changes[0].id]))).toBe(
      next.replace(/\r\n/g, "\n"),
    );
  });

  it("handles additions independently of other changes", () => {
    const next = `John Doe
john@example.com | 555-1234

EXPERIENCE
- Built a REST API in Python
- Wrote tests
- Deployed with Docker

EDUCATION
- BS Computer Science`;
    const hunks = computeHunks(OLD, next);
    const changes = changedHunks(hunks);
    // Contact line edit + a new bullet = at least two decisions.
    expect(changes.length).toBeGreaterThanOrEqual(2);

    // Accept everything -> exactly the proposal.
    const all = new Set(changes.map((h) => h.id));
    expect(applyHunks(hunks, all)).toBe(next.replace(/\r\n/g, "\n"));

    // Accept only the added Docker bullet -> contact line stays original.
    const addHunk = changes.find(
      (h) => h.kind === "add" && h.after.join("\n").includes("Docker"),
    );
    expect(addHunk).toBeTruthy();
    const result = applyHunks(hunks, new Set([addHunk!.id]));
    expect(result).toContain("- Deployed with Docker");
    expect(result).toContain("john@example.com\n"); // original contact kept
    expect(result).not.toContain("555-1234");
  });

  it("applies a deletion only when accepted", () => {
    const next = OLD.replace("\n- Wrote tests", "");
    const hunks = computeHunks(OLD, next);
    const changes = changedHunks(hunks);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("del");
    // Rejected keeps the line; accepted removes it.
    expect(applyHunks(hunks, new Set())).toContain("- Wrote tests");
    expect(applyHunks(hunks, new Set([changes[0].id]))).not.toContain(
      "- Wrote tests",
    );
  });
});
