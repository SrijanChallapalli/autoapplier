import type {
  AnswerField,
  Application,
  ApplicationStatus,
  Confidence,
  Job,
  Profile,
} from "./types";
import { newId } from "./store";

// ---------------------------------------------------------------------------
// Prepare an application from a matched job. Fills every standard question the
// agent can answer from the profile, flags anything unusual for human review,
// and builds the review summary the dashboard shows before submission.
// ---------------------------------------------------------------------------

// Standard questions the agent can answer directly from the profile.
function standardAnswers(profile: Profile): AnswerField[] {
  const a: AnswerField[] = [];
  const add = (
    question: string,
    answer: string | undefined,
    source: AnswerField["source"] = "profile",
  ) => {
    if (answer && answer.trim()) {
      a.push({ question, answer: answer.trim(), source, unusual: false });
    }
  };

  add("Full name", profile.fullName);
  add("Email", profile.email);
  add("Phone", profile.phone);
  add("Current location", profile.location);
  add("LinkedIn", profile.linkedin);
  add("GitHub", profile.github);
  add("Portfolio / website", profile.portfolio);
  add("University / school", profile.university);
  add("Major / field of study", profile.major);
  add(
    "Degree",
    profile.degree && profile.graduationDate
      ? `${profile.degree}, expected ${profile.graduationDate}`
      : profile.degree,
  );
  add("Expected graduation", profile.graduationDate);
  add("GPA", profile.gpa);
  add("Work authorization", profile.authorization.workAuthorization);
  add(
    "Do you now or will you require sponsorship?",
    profile.authorization.requiresSponsorshipNow ||
      profile.authorization.requiresSponsorshipFuture
      ? "Yes"
      : "No",
  );
  add(
    "Are you willing to relocate?",
    profile.preferences.willingToRelocate ? "Yes" : "No",
  );

  // Learned free-form answers.
  for (const [q, ans] of Object.entries(profile.savedAnswers)) {
    add(q, ans, "saved");
  }
  return a;
}

// Detect application questions that need the user (essay/legal/salary/unclear).
// In this build the job description is scanned for question-like prompts; a real
// portal integration would feed the actual form fields through the same filter.
const UNUSUAL_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "salary/compensation", re: /(salary|compensation|pay expectation|desired pay|expected salary)/i },
  { label: "essay/why", re: /(why (do|are) you|cover letter|tell us|describe a time|500 words|word essay|in your own words)/i },
  { label: "legal", re: /(felony|convicted|background check|non-compete|export control|itar|clearance level|disability status|veteran status)/i },
  { label: "availability", re: /(start date|available to start|hours per week|earliest availability)/i },
  { label: "references", re: /(provide (\d+ )?references|reference contact)/i },
];

function detectOpenQuestions(job: Job): {
  openQuestions: string[];
  flagged: AnswerField[];
} {
  const openQuestions: string[] = [];
  const flagged: AnswerField[] = [];
  const lines = job.description.split(/\n|(?<=[.?!])\s+/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.length > 220) continue;
    for (const { label, re } of UNUSUAL_PATTERNS) {
      if (re.test(line)) {
        openQuestions.push(`(${label}) ${line}`);
        break;
      }
    }
  }
  return { openQuestions: dedupe(openQuestions).slice(0, 8), flagged };
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.trim()))).filter(Boolean);
}

function statusFor(confidence: Confidence): ApplicationStatus {
  if (confidence === "high") return "ready";
  if (confidence === "medium") return "needs_review";
  return "needs_input";
}

export function prepareApplication(
  job: Job,
  profile: Profile,
): Application {
  const match = job.match;
  const confidence: Confidence = match?.confidence ?? "low";

  const answers = standardAnswers(profile);
  const { openQuestions } = detectOpenQuestions(job);

  const resume = profile.resumes.find(
    (r) => r.id === match?.suggestedResumeId,
  );

  // If there are open questions, the app can't be "ready" no matter the score.
  let effectiveConfidence = confidence;
  if (openQuestions.length > 0 && effectiveConfidence === "high") {
    effectiveConfidence = "medium";
  }

  const matchSummary = buildMatchSummary(job, profile);

  const keyRequirements = dedupe([
    ...(job.requiredSkills.length
      ? [`Required skills: ${job.requiredSkills.join(", ")}`]
      : []),
    ...(job.minYearsExperience
      ? [`${job.minYearsExperience}+ years experience`]
      : []),
    ...(job.requiresClearance ? ["Security clearance required"] : []),
    ...(job.requiresCitizenship ? ["U.S. citizenship required"] : []),
    ...(job.sponsorshipOffered === false ? ["No visa sponsorship"] : []),
    ...(job.salaryText ? [`Compensation: ${job.salaryText}`] : []),
  ]);

  const now = new Date().toISOString();
  return {
    id: newId("app"),
    jobId: job.id,
    company: job.company,
    title: job.title,
    location: job.location,
    jobUrl: job.url,
    status: statusFor(effectiveConfidence),
    confidence: effectiveConfidence,
    resumeId: resume?.id,
    resumeLabel: resume?.label,
    answers,
    openQuestions,
    matchSummary,
    keyRequirements,
    interviewStages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function buildMatchSummary(job: Job, profile: Profile): string {
  const m = job.match;
  if (!m) return "Not yet analyzed.";
  const bits: string[] = [];
  bits.push(
    `${m.score}/100 fit for a ${profile.preferences.seniority} candidate.`,
  );
  if (m.reasons.length) bits.push(m.reasons.slice(0, 3).join("; ") + ".");
  if (m.concerns.length)
    bits.push(`Watch: ${m.concerns.slice(0, 2).join("; ")}.`);
  return bits.join(" ");
}

// --- Dedup / similar-role handling -----------------------------------------

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

// Is `job` essentially the same posting as one already applied to?
export function isDuplicate(
  job: Job,
  existing: { company: string; title: string; jobUrl?: string }[],
): boolean {
  return existing.some((e) => {
    if (job.url && e.jobUrl && job.url === e.jobUrl) return true;
    if (norm(e.company) !== norm(job.company)) return false;
    return jaccard(tokenize(e.title), tokenize(job.title)) >= 0.8;
  });
}

// Among several similar roles at the same company, keep the best-matching one.
export function pickBestPerCompany(jobs: Job[]): {
  keep: Job[];
  supersededBy: Record<string, string>; // jobId -> keptJobId
} {
  const byCompany = new Map<string, Job[]>();
  for (const j of jobs) {
    const key = norm(j.company);
    byCompany.set(key, [...(byCompany.get(key) ?? []), j]);
  }
  const keep: Job[] = [];
  const supersededBy: Record<string, string> = {};
  for (const group of byCompany.values()) {
    // cluster near-duplicate titles
    const clusters: Job[][] = [];
    for (const j of group) {
      const cluster = clusters.find((c) =>
        c.some(
          (k) => jaccard(tokenize(k.title), tokenize(j.title)) >= 0.6,
        ),
      );
      if (cluster) cluster.push(j);
      else clusters.push([j]);
    }
    for (const cluster of clusters) {
      const best = cluster.reduce((a, b) =>
        (b.match?.score ?? 0) > (a.match?.score ?? 0) ? b : a,
      );
      keep.push(best);
      for (const j of cluster) if (j.id !== best.id) supersededBy[j.id] = best.id;
    }
  }
  return { keep, supersededBy };
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}
