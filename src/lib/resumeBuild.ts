// ---------------------------------------------------------------------------
// Deterministic profile -> resume in the Jake's-template Markdown the PDF parser
// expects (two-column entries: "### Left | Right" then "Left | Right"). Runs
// with NO AI key. It only assembles/orders the candidate's REAL profile — never
// invents. A job, when given, orders skills and entries by role relevance.
//
// Canonical output:
//   # Name
//   email | phone | linkedin.com/in/x | github.com/x
//
//   ## Education
//   ### University | City, ST
//   Degree, Major | Grad date
//
//   ## Skills
//   Languages: ...
//   Frameworks: ...
//
//   ## Experience
//   ### Company | Location
//   Title | Start - End
//   - bullet
//
//   ## Projects
//   ### Project | Tech
//   - bullet
// ---------------------------------------------------------------------------

import type { Job, Profile, Project, WorkExperience } from "./types";

function fmtDate(d?: string): string {
  if (!d) return "";
  const m = d.match(/^(\d{4})-(\d{2})$/);
  if (!m) return d; // already free text ("May 2026", "Present", "2028")
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mi = parseInt(m[2], 10) - 1;
  return months[mi] ? `${months[mi]} ${m[1]}` : m[1];
}

function dateRange(start?: string, end?: string): string {
  const s = fmtDate(start);
  const e = fmtDate(end);
  if (s && e) return `${s} - ${e}`;
  return e || s || "";
}

function stripScheme(u?: string): string {
  return u ? u.replace(/^https?:\/\//i, "").replace(/\/$/, "") : "";
}

// Pipe-separated contact line (matches the parser + the template).
function contactLine(p: Profile): string {
  return [
    p.email,
    p.phone,
    stripScheme(p.linkedin),
    stripScheme(p.github),
    stripScheme(p.portfolio),
    p.authorization?.workAuthorization?.trim(),
  ]
    .filter(Boolean)
    .join(" | ");
}

function relevance(text: string, keywords: string[]): number {
  const t = text.toLowerCase();
  return keywords.reduce((n, k) => (k && t.includes(k.toLowerCase()) ? n + 1 : n), 0);
}
const expText = (e: WorkExperience) => `${e.title} ${e.company} ${e.bullets.join(" ")}`;
const projText = (p: Project) => `${p.name} ${p.description} ${(p.tags ?? []).join(" ")} ${p.bullets.join(" ")}`;

// --- Skill categorization (flat profile list -> template's labeled rows) -----
const CATEGORIES: { label: string; match: RegExp }[] = [
  {
    label: "Languages",
    match: /^(python|java|javascript|typescript|typescript\/javascript|c\+\+|c#|c|go|golang|rust|swift|kotlin|ruby|php|scala|r|sql|html|css|bash|shell|matlab|dart)$/i,
  },
  {
    label: "Frameworks",
    match: /^(react|react native|next\.?js|node\.?js|express|fastapi|flask|django|spring|springboot|vue|angular|svelte|swiftui|\.net|rails|tailwind|redux)$/i,
  },
  {
    label: "Data & ML",
    match: /^(machine learning|deep learning|reinforcement learning|nlp|pytorch|tensorflow|keras|scikit-learn|sklearn|pandas|numpy|xgboost|llms?|foundation models|supabase|postgresql|postgres|mysql|mongodb|redis|spark|hadoop|llamaparse|opencv|apple vision|healthkit)$/i,
  },
  {
    label: "Tools & Testing",
    match: /^(git|github|gitlab|linux|docker|kubernetes|k8s|aws|gcp|azure|vercel|n8n|vitest|jest|pytest|criterion|ci\/cd|figma|jira|apns|tokio)$/i,
  },
];

function categorizeSkills(skills: string[]): { label: string; items: string[] }[] {
  const buckets = CATEGORIES.map((c) => ({ label: c.label, items: [] as string[] }));
  const other: string[] = [];
  for (const s of skills) {
    const idx = CATEGORIES.findIndex((c) => c.match.test(s.trim()));
    if (idx >= 0) buckets[idx].items.push(s);
    else other.push(s);
  }
  if (other.length) buckets.push({ label: "Other", items: other });
  return buckets.filter((b) => b.items.length);
}

// A "project" whose name is really a stray section header or a run-on paragraph
// (an upload-parse artifact) — skip it so it doesn't pollute the resume.
function looksLikeStrayProject(p: Project): boolean {
  const n = p.name.trim();
  if (n.length > 60 && p.bullets.length === 0) return true;
  if (/^(additional|interests|hobbies|awards|activities|references|leadership)\b/i.test(n))
    return true;
  return false;
}

export function buildResumeFromProfile(profile: Profile, job?: Job): string {
  const keywords = job ? [...(job.requiredSkills ?? []), ...(job.niceToHaveSkills ?? [])] : [];
  const out: string[] = [];

  // ---- Header ----
  if (profile.fullName) out.push(`# ${profile.fullName}`);
  const contact = contactLine(profile);
  if (contact) out.push(contact);

  // ---- Education (## / ### University | Location  +  Degree | Grad) ----
  if (profile.university || profile.major) {
    out.push("", "## Education");
    out.push(
      `### ${profile.university || "University"}${profile.location ? ` | ${profile.location}` : ""}`,
    );
    const degree =
      profile.degree && !profile.major.toLowerCase().includes(profile.degree.toLowerCase())
        ? `${profile.degree} ${profile.major}`.trim()
        : profile.major;
    const grad = fmtDate(profile.graduationDate);
    const gpa = profile.gpa ? `GPA: ${profile.gpa}` : "";
    const leftBits = [degree, gpa].filter(Boolean).join(" — ");
    if (leftBits || grad) out.push(`${leftBits}${grad ? ` | ${grad}` : ""}`.trim());
  }

  // ---- Skills (categorized "Label: a, b, c" rows) ----
  if (profile.skills.length) {
    out.push("", "## Skills");
    const ordered = job
      ? [...profile.skills].sort((a, b) => relevance(b, keywords) - relevance(a, keywords) || profile.skills.indexOf(a) - profile.skills.indexOf(b))
      : profile.skills;
    const cats = categorizeSkills(ordered);
    if (cats.length > 1) {
      for (const c of cats) out.push(`${c.label}: ${c.items.join(", ")}`);
    } else {
      out.push(`Skills: ${ordered.join(", ")}`);
    }
  }

  // ---- Experience (### Company | Location / Title | Dates / bullets) ----
  if (profile.experience.length) {
    const exp = job
      ? [...profile.experience].sort((a, b) => relevance(expText(b), keywords) - relevance(expText(a), keywords))
      : profile.experience;
    out.push("", "## Experience");
    for (const e of exp) {
      out.push(`### ${e.company || e.title}${e.location ? ` | ${e.location}` : ""}`);
      const range = dateRange(e.startDate, e.endDate);
      const titleLine = e.company ? e.title : ""; // if no company, title was the header
      if (titleLine || range) out.push(`${titleLine}${range ? ` | ${range}` : ""}`.trim());
      for (const b of e.bullets) if (b.trim()) out.push(`- ${b.trim()}`);
    }
  }

  // ---- Projects (### Name | Tech / bullets) ----
  const projects = profile.projects.filter((p) => p.name && !looksLikeStrayProject(p));
  if (projects.length) {
    const projs = job
      ? [...projects].sort((a, b) => relevance(projText(b), keywords) - relevance(projText(a), keywords))
      : projects;
    out.push("", "## Projects");
    for (const pr of projs) {
      const tech = (pr.tags ?? []).join(", ");
      out.push(`### ${pr.name}${tech ? ` | ${tech}` : ""}`);
      if (!tech && pr.description) out.push(pr.description);
      for (const b of pr.bullets) if (b.trim()) out.push(`- ${b.trim()}`);
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function profileHasResumeContent(profile: Profile): boolean {
  return Boolean(
    profile.fullName || profile.experience.length || profile.projects.length || profile.skills.length,
  );
}
