import type { Application, Job, Profile } from "./types";
import { extractSkills } from "./skills";

// ---------------------------------------------------------------------------
// Flag analysis for a prepared application: green (good), yellow (needs
// improvement), red (needs to change), plus concrete ATS suggestions. Fully
// deterministic and explainable; the resume-chat feature layers LLM help on top.
// ---------------------------------------------------------------------------

export type FlagLevel = "green" | "yellow" | "red";

export interface Flag {
  level: FlagLevel;
  title: string;
  detail?: string;
}

export interface FlagReport {
  flags: Flag[];
  atsSuggestions: string[];
  atsScore: number; // 0-100 readiness to pass ATS keyword screens
  missingKeywords: string[];
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function profileSkillSet(profile: Profile): Set<string> {
  const set = new Set<string>();
  for (const s of profile.skills) set.add(norm(s));
  const extra = [
    ...profile.experience.flatMap((e) => [...(e.tags ?? []), ...e.bullets]),
    ...profile.projects.flatMap((p) => [...(p.tags ?? []), ...p.bullets]),
  ].join(" ");
  for (const s of extractSkills(extra)) set.add(norm(s));
  return set;
}

// Keywords the resume text (if tailored) actually contains.
function resumeText(app?: Application): string {
  return (app?.tailoredResume ?? "").toLowerCase();
}

export function analyzeFlags(
  job: Job,
  profile: Profile,
  app?: Application,
): FlagReport {
  const green: Flag[] = [];
  const yellow: Flag[] = [];
  const red: Flag[] = [];

  const m = job.match;
  const pSkills = profileSkillSet(profile);
  const req = job.requiredSkills;
  const nice = job.niceToHaveSkills;
  const matchedReq = req.filter((s) => pSkills.has(norm(s)));
  const missingReq = req.filter((s) => !pSkills.has(norm(s)));
  const matchedNice = nice.filter((s) => pSkills.has(norm(s)));
  const rtext = resumeText(app);

  // --- RED: hard problems that must change ---------------------------------
  for (const b of m?.blockers ?? []) {
    red.push({ level: "red", title: b, detail: "This is a hard requirement you don't currently meet." });
  }
  if (req.length && missingReq.length > req.length / 2) {
    red.push({
      level: "red",
      title: `Missing most required skills (${missingReq.length}/${req.length})`,
      detail: `The role centers on ${missingReq.slice(0, 5).join(", ")}. This may be a stretch.`,
    });
  }
  if (!app?.resumeId && !app?.tailoredResume) {
    red.push({
      level: "red",
      title: "No resume attached",
      detail: "Pick a resume variant or generate a tailored one below.",
    });
  }

  // --- GREEN: genuine strengths --------------------------------------------
  if ((m?.eligible ?? true) && (m?.blockers.length ?? 0) === 0) {
    green.push({ level: "green", title: "Meets all hard requirements", detail: "No eligibility blockers for this role." });
  }
  if (req.length && matchedReq.length / req.length >= 0.6) {
    green.push({
      level: "green",
      title: `Strong skill match (${matchedReq.length}/${req.length} required)`,
      detail: matchedReq.slice(0, 8).join(", "),
    });
  }
  if (matchedNice.length) {
    green.push({
      level: "green",
      title: "Has bonus skills the role values",
      detail: matchedNice.slice(0, 6).join(", "),
    });
  }
  if (job.remote && profile.preferences.locations.map(norm).includes("remote")) {
    green.push({ level: "green", title: "Remote — matches your preference" });
  }
  if ((m?.score ?? 0) >= 72) {
    green.push({ level: "green", title: `Strong overall fit (${m?.score}/100)` });
  }

  // --- YELLOW: improvable ---------------------------------------------------
  if (missingReq.length && missingReq.length <= req.length / 2) {
    yellow.push({
      level: "yellow",
      title: `Some required skills aren't evident: ${missingReq.slice(0, 5).join(", ")}`,
      detail: "If you have any of these, make sure they appear on your resume for this role.",
    });
  }
  const missingNice = nice.filter((s) => !pSkills.has(norm(s)));
  if (missingNice.length) {
    yellow.push({
      level: "yellow",
      title: `Nice-to-haves you could highlight: ${missingNice.slice(0, 5).join(", ")}`,
      detail: "Not required, but they strengthen the application if you have exposure.",
    });
  }
  if (!app?.tailoredResume) {
    yellow.push({
      level: "yellow",
      title: "Resume isn't tailored to this role yet",
      detail: "Use the resume editor below to tailor it — tailored resumes pass ATS keyword screens far more often.",
    });
  } else {
    // Tailored resume exists — check it actually contains the required keywords.
    const notInResume = matchedReq.filter((s) => !rtext.includes(norm(s)));
    if (notInResume.length) {
      yellow.push({
        level: "yellow",
        title: `Skills you have but the resume omits: ${notInResume.slice(0, 5).join(", ")}`,
        detail: "You have these, but the tailored resume doesn't mention them — add them for ATS.",
      });
    }
  }
  if (app?.openQuestions.length) {
    yellow.push({
      level: "yellow",
      title: `${app.openQuestions.length} application question${app.openQuestions.length === 1 ? "" : "s"} still need answers`,
    });
  }
  if ((m?.score ?? 0) >= 50 && (m?.score ?? 0) < 72) {
    yellow.push({ level: "yellow", title: `Moderate fit (${m?.score}/100) — worth strengthening before submitting` });
  }

  // --- ATS suggestions ------------------------------------------------------
  const missingKeywords = Array.from(new Set([...missingReq, ...missingNice]));
  const atsSuggestions: string[] = [];
  if (missingKeywords.length) {
    atsSuggestions.push(
      `Include these exact keywords from the posting where they truthfully apply: ${missingKeywords.slice(0, 10).join(", ")}.`,
    );
  }
  // Only suggest echoing the title when we actually parsed a real one.
  const hasRealTitle = job.title && !/^(untitled role|unknown)/i.test(job.title);
  if (hasRealTitle) {
    atsSuggestions.push(
      `Echo the exact job title ("${job.title}") in your summary or a headline so title-matching ATS filters catch it.`,
    );
  }
  atsSuggestions.push(
    "Use a single-column, text-based layout — parsers drop content in tables, columns, headers/footers, and images.",
    "Use standard section headings (Experience, Education, Skills, Projects) so the parser maps your content correctly.",
    "Mirror the posting's phrasing (e.g. their 'REST APIs' vs your 'RESTful services') so keyword matches register.",
    "Quantify impact with numbers, and export a real text-based PDF (not a scanned image).",
  );

  // --- ATS readiness score --------------------------------------------------
  const reqCoverage = req.length ? matchedReq.length / req.length : 0.6;
  let atsScore = Math.round(
    reqCoverage * 70 + (app?.tailoredResume ? 20 : 0) + (app?.resumeId || app?.tailoredResume ? 10 : 0),
  );
  atsScore = Math.max(0, Math.min(100, atsScore));

  return {
    flags: [...green, ...yellow, ...red],
    atsSuggestions,
    atsScore,
    missingKeywords,
  };
}
