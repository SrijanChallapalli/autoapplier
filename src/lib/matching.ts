import type {
  Confidence,
  Job,
  MatchResult,
  PreferenceSignal,
  Profile,
  ResumeVariant,
} from "./types";
import { extractSkills } from "./skills";
import { countryAllowed, detectCountry } from "./geo";

// ---------------------------------------------------------------------------
// The matcher scores a job against the profile. It is deterministic and
// explainable — every point is tied to a reason the user can read. An optional
// LLM pass (ai.ts) can add nuance, but the numbers here always stand alone.
// ---------------------------------------------------------------------------

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function profileSkillSet(profile: Profile): Set<string> {
  const set = new Set<string>();
  for (const s of profile.skills) set.add(norm(s));
  // Skills implied by experience/projects bullets and tags:
  const extra = [
    ...profile.experience.flatMap((e) => [...(e.tags ?? []), ...e.bullets]),
    ...profile.projects.flatMap((p) => [...(p.tags ?? []), ...p.bullets]),
  ].join(" ");
  for (const s of extractSkills(extra)) set.add(norm(s));
  return set;
}

// Map the user's declared seniority preference to acceptable job levels.
function acceptableLevels(profile: Profile): Set<string> {
  const s = profile.preferences.seniority;
  if (s === "internship") return new Set(["internship", "unknown"]);
  if (s === "new-grad")
    return new Set(["new-grad", "junior", "internship", "unknown"]);
  if (s === "junior")
    return new Set(["junior", "new-grad", "mid", "unknown"]);
  return new Set([
    "internship",
    "new-grad",
    "junior",
    "mid",
    "senior",
    "unknown",
  ]);
}

function selectResume(
  job: Job,
  profile: Profile,
): ResumeVariant | undefined {
  if (profile.resumes.length === 0) return undefined;
  const haystack = `${job.title} ${job.description} ${job.requiredSkills.join(
    " ",
  )}`.toLowerCase();
  let best: ResumeVariant | undefined;
  let bestScore = -1;
  for (const r of profile.resumes) {
    const score = r.focus.reduce(
      (acc, f) => acc + (haystack.includes(f.toLowerCase()) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best ?? profile.resumes[0];
}

function learningAdjustment(
  job: Job,
  signals: PreferenceSignal[],
): { delta: number; note?: string } {
  if (signals.length === 0) return { delta: 0 };
  const jobTags = new Set(
    extractSkills(`${job.title} ${job.description}`).map(norm),
  );
  let delta = 0;
  for (const sig of signals) {
    const overlap = sig.tags.filter((t) => jobTags.has(norm(t))).length;
    if (overlap > 0) delta += sig.weight * Math.min(overlap, 3);
  }
  delta = Math.max(-10, Math.min(10, delta));
  if (delta === 0) return { delta: 0 };
  return {
    delta,
    note:
      delta > 0
        ? "Similar to roles you've approved before"
        : "Similar to roles you've dismissed before",
  };
}

export interface MatchContext {
  profile: Profile;
  signals?: PreferenceSignal[];
}

export function matchJob(job: Job, ctx: MatchContext): MatchResult {
  const { profile } = ctx;
  const signals = ctx.signals ?? [];

  const reasons: string[] = [];
  const concerns: string[] = [];
  const blockers: string[] = [];

  // --- Hard eligibility checks (blockers) ---------------------------------
  if (job.requiresClearance) {
    blockers.push("Requires an active security clearance");
  }
  if (
    job.sponsorshipOffered === false &&
    (profile.authorization.requiresSponsorshipNow ||
      profile.authorization.requiresSponsorshipFuture)
  ) {
    blockers.push("No visa sponsorship, but you need sponsorship");
  }
  const levels = acceptableLevels(profile);
  if (job.seniority && !levels.has(job.seniority)) {
    blockers.push(
      `Seniority mismatch: role is ${job.seniority}, you want ${profile.preferences.seniority}`,
    );
  }
  // Experience requirement far above an internship/new-grad candidate.
  const yearsCap = profile.preferences.seniority === "internship" ? 2 : 4;
  if (job.minYearsExperience && job.minYearsExperience > yearsCap) {
    blockers.push(
      `Requires ${job.minYearsExperience}+ years of experience`,
    );
  }
  // User's hard exclude keywords.
  const descLower = `${job.title} ${job.description}`.toLowerCase();
  for (const kw of profile.preferences.excludeKeywords) {
    if (kw && descLower.includes(kw.toLowerCase())) {
      blockers.push(`Matches an excluded keyword: "${kw}"`);
    }
  }
  // Country restriction — only blocks when the job's country is determinable
  // and not in the allowed list (bare "Remote" is never excluded).
  const allowedCountries = profile.preferences.countries ?? [];
  if (
    allowedCountries.length &&
    job.location &&
    !countryAllowed(job.location, allowedCountries)
  ) {
    blockers.push(
      `Outside your target countries (${detectCountry(job.location) ?? job.location})`,
    );
  }

  // --- Skill overlap -------------------------------------------------------
  const pSkills = profileSkillSet(profile);
  const req = job.requiredSkills.map(norm);
  const nice = job.niceToHaveSkills.map(norm);
  const matchedSkills = job.requiredSkills.filter((s) => pSkills.has(norm(s)));
  const missingSkills = job.requiredSkills.filter((s) => !pSkills.has(norm(s)));
  const matchedNice = job.niceToHaveSkills.filter((s) => pSkills.has(norm(s)));

  const reqCoverage = req.length ? matchedSkills.length / req.length : 0.6;

  // --- Interest / role alignment ------------------------------------------
  const interests = [
    ...profile.preferences.interests,
    ...profile.preferences.roles,
  ].map(norm);
  const interestHits = interests.filter((i) => descLower.includes(i)).length;
  const interestScore = Math.min(1, interestHits / 3);

  // --- Location fit --------------------------------------------------------
  let locationScore = 0.5;
  const prefLocs = profile.preferences.locations.map(norm);
  const wantsRemote = prefLocs.includes("remote");
  if (job.remote && wantsRemote) {
    locationScore = 1;
    reasons.push("Remote, which you prefer");
  } else if (
    job.location &&
    prefLocs.some((l) => l !== "remote" && norm(job.location!).includes(l))
  ) {
    locationScore = 1;
    reasons.push(`Located in a preferred area (${job.location})`);
  } else if (profile.preferences.willingToRelocate) {
    locationScore = 0.7;
  } else if (job.location && !job.remote) {
    locationScore = 0.3;
    concerns.push(
      `Location (${job.location}) isn't a preference and you're not open to relocating`,
    );
  }

  // --- Compose the score ---------------------------------------------------
  // Weights sum to 100 before adjustments.
  let score =
    reqCoverage * 50 + interestScore * 25 + locationScore * 15 + (matchedNice.length ? 10 : 0);

  const learn = learningAdjustment(job, signals);
  score += learn.delta;
  if (learn.note) {
    (learn.delta > 0 ? reasons : concerns).push(learn.note);
  }

  score = Math.round(Math.max(0, Math.min(100, score)));

  // --- Build human-readable reasons/concerns ------------------------------
  if (matchedSkills.length) {
    reasons.push(
      `Matches ${matchedSkills.length}/${
        req.length || matchedSkills.length
      } required skills: ${matchedSkills.slice(0, 6).join(", ")}`,
    );
  }
  if (matchedNice.length) {
    reasons.push(`Has nice-to-haves: ${matchedNice.slice(0, 4).join(", ")}`);
  }
  if (interestHits > 0) {
    reasons.push("Aligns with your stated interests/roles");
  }
  if (missingSkills.length) {
    concerns.push(
      `Missing skills mentioned: ${missingSkills.slice(0, 6).join(", ")}`,
    );
  }
  if (job.sponsorshipOffered === null && profile.authorization.requiresSponsorshipFuture) {
    concerns.push("Sponsorship policy unclear — worth confirming");
  }
  if (!job.requiredSkills.length) {
    concerns.push("Couldn't extract clear requirements from the description");
  }

  const eligible = blockers.length === 0;

  // --- Confidence & recommendation ----------------------------------------
  // High: eligible, strong score, no meaningful concerns.
  // Medium: eligible, decent score, some concerns to review.
  // Low: ineligible, or weak score / big unknowns.
  let confidence: Confidence;
  if (!eligible || score < 45) {
    confidence = "low";
  } else if (score >= 72 && concerns.length <= 1) {
    confidence = "high";
  } else {
    confidence = "medium";
  }

  const recommended = eligible && score >= 50;

  const resume = selectResume(job, profile);

  return {
    score,
    confidence,
    recommended,
    eligible,
    reasons,
    concerns,
    blockers,
    matchedSkills,
    missingSkills,
    suggestedResumeId: resume?.id,
    computedAt: new Date().toISOString(),
  };
}

// Rank a set of jobs: recommended first, then by score, then newest first so
// the order is stable and fresh postings surface above equally-scored stale ones.
export function rankJobs(jobs: Job[]): Job[] {
  return [...jobs].sort((a, b) => {
    const am = a.match;
    const bm = b.match;
    if (!am || !bm) return (bm?.score ?? -1) - (am?.score ?? -1);
    if (am.eligible !== bm.eligible) return am.eligible ? -1 : 1;
    if (am.recommended !== bm.recommended) return am.recommended ? -1 : 1;
    if (bm.score !== am.score) return bm.score - am.score;
    return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
  });
}
