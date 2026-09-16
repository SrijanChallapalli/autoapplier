// ---------------------------------------------------------------------------
// Deterministic profile -> resume (Jake's layout, ATS-safe Markdown). This runs
// with NO AI key: it assembles the candidate's REAL profile into a one-page
// resume in the exact section order the PDF renderer expects. When a job is
// given, it only *reorders* skills (role-relevant first) and features the most
// relevant experience/projects first — it never invents or rephrases content.
// ---------------------------------------------------------------------------

import type { Job, Profile, Project, WorkExperience } from "./types";

// Turn "2024-06" into "Jun 2024"; leave free-text ("Present", "2028") as-is.
function fmtDate(d?: string): string {
  if (!d) return "";
  const m = d.match(/^(\d{4})-(\d{2})$/);
  if (!m) return d;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const mi = parseInt(m[2], 10) - 1;
  return months[mi] ? `${months[mi]} ${m[1]}` : m[1];
}

function dateRange(start?: string, end?: string): string {
  const s = fmtDate(start);
  const e = fmtDate(end);
  if (s && e) return `${s} - ${e}`;
  return e || s || "";
}

// Contact line: plain text, " · " separated, URLs stripped of the scheme so
// they read as normal text (linkedin.com/in/...), ATS-safe.
function contactLine(p: Profile): string {
  const url = (u?: string) => (u ? u.replace(/^https?:\/\//i, "").replace(/\/$/, "") : "");
  return [p.email, p.phone, p.location, url(p.linkedin), url(p.github), url(p.portfolio)]
    .filter(Boolean)
    .join(" · ");
}

// Score how relevant an entry is to the job (by keyword hits in its text), so
// the most role-relevant real experience/projects lead. Purely for ordering.
function relevance(text: string, keywords: string[]): number {
  const t = text.toLowerCase();
  return keywords.reduce((n, k) => (k && t.includes(k.toLowerCase()) ? n + 1 : n), 0);
}

function expText(e: WorkExperience): string {
  return `${e.title} ${e.company} ${e.bullets.join(" ")}`;
}
function projText(p: Project): string {
  return `${p.name} ${p.description} ${p.bullets.join(" ")}`;
}

export function buildResumeFromProfile(profile: Profile, job?: Job): string {
  const keywords = job
    ? [...(job.requiredSkills ?? []), ...(job.niceToHaveSkills ?? [])]
    : [];

  const lines: string[] = [];

  // ---- Header ----
  if (profile.fullName) lines.push(`# ${profile.fullName}`);
  const contact = contactLine(profile);
  if (contact) lines.push(contact);

  // ---- Education ----
  if (profile.university || profile.major) {
    lines.push("", "## Education");
    const uniRight = [profile.location].filter(Boolean).join("");
    lines.push(
      `### ${profile.university}${uniRight ? ` — ${uniRight}` : ""}`.trimEnd(),
    );
    const degree = [profile.degree, profile.major].filter(Boolean).join(" ").trim();
    const gradBits = [
      degree,
      profile.gpa ? `GPA: ${profile.gpa}` : "",
      fmtDate(profile.graduationDate),
    ].filter(Boolean);
    if (gradBits.length) lines.push(gradBits.join(" — "));
  }

  // ---- Skills (role-relevant first when a job is given) ----
  if (profile.skills.length) {
    const skills = job
      ? [...profile.skills].sort(
          (a, b) =>
            relevance(b, keywords) - relevance(a, keywords) ||
            profile.skills.indexOf(a) - profile.skills.indexOf(b),
        )
      : profile.skills;
    lines.push("", "## Skills", `- ${skills.join(", ")}`);
  }

  // ---- Experience (most role-relevant real roles first) ----
  if (profile.experience.length) {
    const exp = job
      ? [...profile.experience].sort(
          (a, b) => relevance(expText(b), keywords) - relevance(expText(a), keywords),
        )
      : profile.experience;
    lines.push("", "## Experience");
    for (const e of exp) {
      const range = dateRange(e.startDate, e.endDate);
      const title = [e.title, e.company].filter(Boolean).join(" — ");
      lines.push(`### ${title}${range ? ` (${range})` : ""}`);
      for (const b of e.bullets) if (b.trim()) lines.push(`- ${b.trim()}`);
    }
  }

  // ---- Projects ----
  if (profile.projects.length) {
    const projs = job
      ? [...profile.projects].sort(
          (a, b) => relevance(projText(b), keywords) - relevance(projText(a), keywords),
        )
      : profile.projects;
    lines.push("", "## Projects");
    for (const pr of projs) {
      const head = pr.description ? `${pr.name} — ${pr.description}` : pr.name;
      lines.push(`### ${head}`);
      for (const b of pr.bullets) if (b.trim()) lines.push(`- ${b.trim()}`);
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Does the profile have enough real content to build a resume?
export function profileHasResumeContent(profile: Profile): boolean {
  return Boolean(
    profile.fullName ||
      profile.experience.length ||
      profile.projects.length ||
      profile.skills.length,
  );
}
