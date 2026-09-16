import { describe, it, expect } from "vitest";
import { matchJob } from "../src/lib/matching";
import { parseJob } from "../src/lib/parse";
import { defaultProfile } from "../src/lib/defaultProfile";
import type { PreferenceSignal, Profile } from "../src/lib/types";

function profile(): Profile {
  const p = defaultProfile();
  p.skills = ["Python", "React"];
  p.preferences.seniority = "internship";
  p.preferences.locations = ["Remote"];
  return p;
}

const NOW = Date.parse("2026-09-16T00:00:00.000Z");
function daysAgo(n: number): string {
  return new Date(NOW - n * 86_400_000).toISOString();
}

let seq = 0;
function signal(
  kind: PreferenceSignal["kind"],
  tags: string[],
  weight: number,
  createdAt = daysAgo(0),
): PreferenceSignal {
  seq += 1;
  return {
    id: `sig_${seq}`,
    kind,
    jobTitle: "x",
    company: "y",
    tags,
    weight,
    createdAt,
  };
}

// A job whose text surfaces Python + React as tags.
function job() {
  return parseJob({
    text: "Software Engineer Intern. Remote. Work with Python and React.",
  });
}

describe("learning adjustment", () => {
  it("is zero and silent with no signals", () => {
    const m = matchJob(job(), { profile: profile(), signals: [], now: NOW });
    expect(m.learningDelta).toBe(0);
    expect(m.learningTags).toEqual([]);
    expect(m.reasons.join(" ")).not.toMatch(/from your history/i);
  });

  it("nudges the score up and names the driving tags for approved-like roles", () => {
    const signals = [signal("approved", ["Python", "React"], 2)];
    const m = matchJob(job(), { profile: profile(), signals, now: NOW });
    expect(m.learningDelta).toBeGreaterThan(0);
    expect(m.learningTags).toEqual(expect.arrayContaining(["Python", "React"]));
    expect(m.reasons.join(" ")).toMatch(/from your history — like roles you've approved/i);
    expect(m.reasons.join(" ")).toContain("Python");
  });

  it("nudges the score down and files a concern for dismissed-like roles", () => {
    const signals = [signal("rejected", ["Python", "React"], -2)];
    const m = matchJob(job(), { profile: profile(), signals, now: NOW });
    expect(m.learningDelta).toBeLessThan(0);
    expect(m.concerns.join(" ")).toMatch(/dismissed/i);
    expect(m.reasons.join(" ")).not.toMatch(/from your history/i);
  });

  it("weights recent signals more than old ones (recency decay)", () => {
    const recent = matchJob(job(), {
      profile: profile(),
      signals: [signal("approved", ["Python", "React"], 2, daysAgo(0))],
      now: NOW,
    });
    const old = matchJob(job(), {
      profile: profile(),
      signals: [signal("approved", ["Python", "React"], 2, daysAgo(180))],
      now: NOW,
    });
    expect(recent.learningDelta!).toBeGreaterThan(old.learningDelta!);
  });

  it("ignores signals whose tags don't overlap the job", () => {
    const m = matchJob(job(), {
      profile: profile(),
      signals: [signal("approved", ["Rust", "Kubernetes"], 2)],
      now: NOW,
    });
    expect(m.learningDelta).toBe(0);
  });

  it("caps the total adjustment so history can't swamp the base score", () => {
    // Many strong, recent approvals across several overlapping tags.
    const signals = Array.from({ length: 30 }, () =>
      signal("interview", ["Python", "React"], 3),
    );
    const m = matchJob(job(), { profile: profile(), signals, now: NOW });
    expect(m.learningDelta!).toBeLessThanOrEqual(12);
    expect(m.learningDelta!).toBeGreaterThan(0);
  });
});
