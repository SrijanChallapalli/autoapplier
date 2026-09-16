import { describe, it, expect } from "vitest";
import { computeInsights } from "../src/lib/insights";
import { defaultProfile } from "../src/lib/defaultProfile";
import type { Application, ApplicationStatus, Job, Profile } from "../src/lib/types";

function profile(skills: string[] = ["Python", "React"]): Profile {
  const p = defaultProfile();
  p.skills = skills;
  // Keep experience/projects empty so skill inference doesn't add coverage the
  // test isn't asserting on.
  p.experience = [];
  p.projects = [];
  return p;
}

let seq = 0;
function app(over: Partial<Application> = {}): Application {
  seq += 1;
  return {
    id: `app-${seq}`,
    jobId: `job-${seq}`,
    company: "Acme",
    title: "SWE Intern",
    status: "draft" as ApplicationStatus,
    confidence: "medium",
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

function job(over: Partial<Job> = {}): Job {
  seq += 1;
  return {
    id: `job-${seq}`,
    company: "Acme",
    title: "SWE Intern",
    description: "",
    requiredSkills: [],
    niceToHaveSkills: [],
    source: "paste",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

const NOW = new Date("2026-09-16T12:00:00.000Z");

describe("computeInsights funnel", () => {
  it("counts every prepared application at the top of the funnel", () => {
    const ins = computeInsights([app(), app(), app()], [], profile(), NOW);
    expect(ins.totalPrepared).toBe(3);
    expect(ins.funnel[0]).toMatchObject({ key: "prepared", count: 3 });
  });

  it("is monotonic: a later stage implies every earlier one", () => {
    const ins = computeInsights(
      [app({ status: "offer", dateApplied: "2026-09-05" })],
      [],
      profile(),
      NOW,
    );
    const byKey = Object.fromEntries(ins.funnel.map((f) => [f.key, f.count]));
    expect(byKey.prepared).toBe(1);
    expect(byKey.applied).toBe(1);
    expect(byKey.responded).toBe(1);
    expect(byKey.interviewed).toBe(1);
    expect(byKey.offer).toBe(1);
  });

  it("treats a recorded interview stage as a response even in an early status", () => {
    const ins = computeInsights(
      [
        app({
          status: "submitted",
          dateApplied: "2026-09-05",
          interviewStages: [{ name: "Technical", outcome: "pending" }],
        }),
      ],
      [],
      profile(),
      NOW,
    );
    const byKey = Object.fromEntries(ins.funnel.map((f) => [f.key, f.count]));
    expect(byKey.responded).toBe(1);
    expect(byKey.interviewed).toBe(1);
    expect(byKey.offer).toBe(0);
  });

  it("returns null rates when nothing has been applied to yet", () => {
    const ins = computeInsights([app(), app()], [], profile(), NOW);
    expect(ins.responseRate).toBeNull();
    expect(ins.interviewRate).toBeNull();
    expect(ins.offerRate).toBeNull();
  });

  it("computes conversion rates against the applied count", () => {
    const ins = computeInsights(
      [
        app({ status: "submitted", dateApplied: "2026-09-05" }),
        app({ status: "screening", dateApplied: "2026-09-05" }),
        app({ status: "interviewing", dateApplied: "2026-09-05" }),
        app({ status: "offer", dateApplied: "2026-09-05" }),
      ],
      [],
      profile(),
      NOW,
    );
    // applied = 4, responded = 3 (screening, interviewing, offer), interviewed = 2, offers = 1
    expect(ins.responseRate).toBeCloseTo(3 / 4);
    expect(ins.interviewRate).toBeCloseTo(2 / 4);
    expect(ins.offerRate).toBeCloseTo(1 / 4);
  });
});

describe("computeInsights skill gaps", () => {
  it("surfaces required skills missing from the profile on recommended, unapplied jobs", () => {
    const jobs = [
      job({
        id: "j1",
        company: "Acme",
        requiredSkills: ["Python", "Kubernetes"],
        match: { recommended: true } as Job["match"],
      }),
      job({
        id: "j2",
        company: "Globex",
        requiredSkills: ["Kubernetes", "Go"],
        match: { recommended: true } as Job["match"],
      }),
    ];
    const ins = computeInsights([], jobs, profile(["Python"]), NOW);
    const gap = ins.skillGaps.find((g) => g.skill === "Kubernetes");
    expect(gap?.jobCount).toBe(2);
    expect(gap?.companies).toEqual(expect.arrayContaining(["Acme", "Globex"]));
    // Python is covered, so it must not appear as a gap.
    expect(ins.skillGaps.some((g) => g.skill === "Python")).toBe(false);
    // Gaps are sorted by frequency: Kubernetes (2) before Go (1).
    expect(ins.skillGaps[0].skill).toBe("Kubernetes");
  });

  it("ignores dismissed jobs, non-recommended jobs, and jobs already applied to", () => {
    const jobs = [
      job({ id: "d", requiredSkills: ["Rust"], dismissed: true, match: { recommended: true } as Job["match"] }),
      job({ id: "n", requiredSkills: ["Scala"], match: { recommended: false } as Job["match"] }),
      job({ id: "applied", requiredSkills: ["Elixir"], match: { recommended: true } as Job["match"] }),
    ];
    const apps = [app({ jobId: "applied", status: "submitted", dateApplied: "2026-09-05" })];
    const ins = computeInsights(apps, jobs, profile([]), NOW);
    const skills = ins.skillGaps.map((g) => g.skill);
    expect(skills).not.toContain("Rust");
    expect(skills).not.toContain("Scala");
    expect(skills).not.toContain("Elixir");
  });
});

describe("computeInsights follow-ups and interviews", () => {
  it("lists overdue and due-soon follow-ups soonest-first, flagging overdue", () => {
    const ins = computeInsights(
      [
        app({ id: "over", followUpDate: "2026-09-10" }), // 6 days ago
        app({ id: "soon", followUpDate: "2026-09-18" }), // in 2 days
        app({ id: "far", followUpDate: "2026-10-30" }), // beyond a week -> excluded
      ],
      [],
      profile(),
      NOW,
    );
    expect(ins.followUps.map((f) => f.applicationId)).toEqual(["over", "soon"]);
    expect(ins.followUps[0].overdue).toBe(true);
    expect(ins.followUps[1].overdue).toBe(false);
  });

  it("lists only upcoming, pending interview stages", () => {
    const ins = computeInsights(
      [
        app({
          interviewStages: [
            { name: "Past screen", date: "2026-09-01", outcome: "passed" },
            { name: "Onsite", date: "2026-09-20", outcome: "pending" },
          ],
        }),
      ],
      [],
      profile(),
      NOW,
    );
    expect(ins.upcomingInterviews).toHaveLength(1);
    expect(ins.upcomingInterviews[0].stage).toBe("Onsite");
  });
});

describe("computeInsights activity and companies", () => {
  it("buckets applications into the last 8 weeks", () => {
    const ins = computeInsights(
      [app({ createdAt: "2026-09-15T00:00:00.000Z" })],
      [],
      profile(),
      NOW,
    );
    expect(ins.activity).toHaveLength(8);
    const total = ins.activity.reduce((n, w) => n + w.count, 0);
    expect(total).toBe(1);
    // The single app was created in the current week (last bucket).
    expect(ins.activity[7].count).toBe(1);
  });

  it("ranks companies by application count", () => {
    const ins = computeInsights(
      [app({ company: "Acme" }), app({ company: "Acme" }), app({ company: "Globex" })],
      [],
      profile(),
      NOW,
    );
    expect(ins.topCompanies[0]).toEqual({ company: "Acme", count: 2 });
    expect(ins.topCompanies[1]).toEqual({ company: "Globex", count: 1 });
  });
});
