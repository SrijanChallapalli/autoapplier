// ---------------------------------------------------------------------------
// Insights — aggregate analytics over the pipeline.
//
// A job search only improves when you can see the shape of it: how many
// applications actually convert to responses and interviews, which required
// skills keep showing up in good matches that you don't yet have, and which
// follow-ups are due. This module turns the raw store (applications, jobs,
// profile) into those numbers.
//
// Everything here is a PURE function of its inputs so it is trivially testable
// and can run on server or client. It reuses the same skill normalization the
// matcher uses, so a "skill gap" here means exactly what "missing skill" means
// on a job match.
// ---------------------------------------------------------------------------

import type { Application, ApplicationStatus, Job, Profile } from "./types";
import { profileSkillSet } from "./matching";
import { daysUntil } from "./format";

// Statuses that mean the user has actually submitted the application (or the
// application has progressed past submission). `withdrawn` is intentionally
// excluded unless a submit date is recorded — you can withdraw before applying.
const APPLIED_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  "submitted",
  "screening",
  "interviewing",
  "offer",
  "rejected",
]);

const RESPONDED_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  "screening",
  "interviewing",
  "offer",
]);

const INTERVIEWED_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  "interviewing",
  "offer",
]);

export interface FunnelStage {
  key: "prepared" | "applied" | "responded" | "interviewed" | "offer";
  label: string;
  count: number;
}

export interface SkillGap {
  skill: string;
  // How many recommended, not-yet-applied jobs require this skill that the
  // profile doesn't cover.
  jobCount: number;
  companies: string[]; // up to a few example companies, for context
}

export interface FollowUp {
  applicationId: string;
  company: string;
  title: string;
  dueDate: string;
  daysAway: number; // negative = overdue
  overdue: boolean;
}

export interface UpcomingInterview {
  applicationId: string;
  company: string;
  title: string;
  stage: string;
  date: string;
  daysAway: number;
}

export interface WeekBucket {
  weekStart: string; // ISO date (Monday) of the week
  label: string; // "Sep 8"
  count: number;
}

export interface Insights {
  totalPrepared: number;
  funnel: FunnelStage[];
  // Conversion rates as fractions in [0,1], or null when the denominator is 0
  // (no applications submitted yet — a rate would be meaningless/misleading).
  responseRate: number | null;
  interviewRate: number | null;
  offerRate: number | null;
  skillGaps: SkillGap[];
  followUps: FollowUp[];
  upcomingInterviews: UpcomingInterview[];
  activity: WeekBucket[];
  topCompanies: { company: string; count: number }[];
}

// How far through the pipeline an application has provably gotten. We only have
// the *current* status plus any recorded interview stages, so we infer the
// furthest stage each of those implies and take the max. Monotonic by design:
// reaching a later stage always implies every earlier one.
function reachedApplied(a: Application): boolean {
  return !!a.dateApplied || APPLIED_STATUSES.has(a.status);
}
function reachedResponded(a: Application): boolean {
  return RESPONDED_STATUSES.has(a.status) || a.interviewStages.length > 0;
}
function reachedInterviewed(a: Application): boolean {
  return INTERVIEWED_STATUSES.has(a.status) || a.interviewStages.length > 0;
}
function reachedOffer(a: Application): boolean {
  return a.status === "offer";
}

// Monday of the week containing `d`, at UTC midnight.
function weekStart(d: Date): Date {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (day.getUTCDay() + 6) % 7; // 0 = Monday
  day.setUTCDate(day.getUTCDate() - dow);
  return day;
}

function shortLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function computeInsights(
  apps: Application[],
  jobs: Job[],
  profile: Profile,
  now: Date = new Date(),
): Insights {
  const totalPrepared = apps.length;

  const applied = apps.filter(reachedApplied).length;
  const responded = apps.filter(reachedResponded).length;
  const interviewed = apps.filter(reachedInterviewed).length;
  const offers = apps.filter(reachedOffer).length;

  const funnel: FunnelStage[] = [
    { key: "prepared", label: "Prepared", count: totalPrepared },
    { key: "applied", label: "Applied", count: applied },
    { key: "responded", label: "Responded", count: responded },
    { key: "interviewed", label: "Interviewed", count: interviewed },
    { key: "offer", label: "Offer", count: offers },
  ];

  const rate = (num: number) => (applied > 0 ? num / applied : null);

  // --- Skill gaps: required skills on recommended, not-yet-applied jobs that
  // the profile doesn't cover. These are the highest-leverage things to learn
  // or add to the resume next.
  const appliedJobIds = new Set(apps.filter(reachedApplied).map((a) => a.jobId));
  const pSkills = profileSkillSet(profile);
  const gapMap = new Map<string, { count: number; companies: Set<string> }>();
  for (const job of jobs) {
    if (job.dismissed) continue;
    if (!job.match?.recommended) continue;
    if (appliedJobIds.has(job.id)) continue;
    for (const skill of job.requiredSkills) {
      if (pSkills.has(skill.trim().toLowerCase())) continue;
      const entry = gapMap.get(skill) ?? { count: 0, companies: new Set<string>() };
      entry.count += 1;
      entry.companies.add(job.company);
      gapMap.set(skill, entry);
    }
  }
  const skillGaps: SkillGap[] = Array.from(gapMap.entries())
    .map(([skill, v]) => ({
      skill,
      jobCount: v.count,
      companies: Array.from(v.companies).slice(0, 3),
    }))
    .sort((a, b) => b.jobCount - a.jobCount || a.skill.localeCompare(b.skill))
    .slice(0, 8);

  // --- Follow-ups due (today or overdue, plus the next week). Soonest first.
  const followUps: FollowUp[] = apps
    .filter((a) => a.followUpDate)
    .map((a) => {
      const daysAway = daysUntil(a.followUpDate, now) ?? 0;
      return {
        applicationId: a.id,
        company: a.company,
        title: a.title,
        dueDate: a.followUpDate!,
        daysAway,
        overdue: daysAway < 0,
      };
    })
    .filter((f) => f.daysAway <= 7)
    .sort((a, b) => a.daysAway - b.daysAway);

  // --- Upcoming interviews: pending stages with a future (or today) date.
  const upcomingInterviews: UpcomingInterview[] = apps
    .flatMap((a) =>
      a.interviewStages
        .filter((s) => s.date && (s.outcome ?? "pending") === "pending")
        .map((s) => {
          const daysAway = daysUntil(s.date, now) ?? 0;
          return {
            applicationId: a.id,
            company: a.company,
            title: a.title,
            stage: s.name,
            date: s.date!,
            daysAway,
          };
        }),
    )
    .filter((s) => s.daysAway >= 0)
    .sort((a, b) => a.daysAway - b.daysAway);

  // --- Activity: applications prepared per week over the last 8 weeks.
  const weeks: WeekBucket[] = [];
  const thisWeek = weekStart(now);
  const counts = new Map<string, number>();
  for (const a of apps) {
    const ws = weekStart(new Date(a.createdAt)).toISOString().slice(0, 10);
    counts.set(ws, (counts.get(ws) ?? 0) + 1);
  }
  for (let i = 7; i >= 0; i--) {
    const d = new Date(thisWeek);
    d.setUTCDate(d.getUTCDate() - i * 7);
    const key = d.toISOString().slice(0, 10);
    weeks.push({ weekStart: key, label: shortLabel(key), count: counts.get(key) ?? 0 });
  }

  // --- Top companies by application count.
  const companyCounts = new Map<string, number>();
  for (const a of apps) {
    companyCounts.set(a.company, (companyCounts.get(a.company) ?? 0) + 1);
  }
  const topCompanies = Array.from(companyCounts.entries())
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count || a.company.localeCompare(b.company))
    .slice(0, 5);

  return {
    totalPrepared,
    funnel,
    responseRate: rate(responded),
    interviewRate: rate(interviewed),
    offerRate: rate(offers),
    skillGaps,
    followUps,
    upcomingInterviews,
    activity: weeks,
    topCompanies,
  };
}
