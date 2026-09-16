// ---------------------------------------------------------------------------
// Build a plain Markdown resume from the structured profile.
//
// This is deterministic and needs no AI — it only ever lays out what the user
// actually entered (never invents), so the resume editor can show a real
// starting draft even without an AI Gateway key. The Markdown uses the same
// conventions the editor's preview renders: `##` sections, `###` entries,
// `-` bullets.
// ---------------------------------------------------------------------------

import type { Profile } from "./types";

function dateRange(start?: string, end?: string): string {
  const s = (start ?? "").trim();
  const e = (end ?? "").trim();
  if (s && e) return `${s} – ${e}`;
  return s || e || "";
}

/** True when there's essentially nothing to render — used to guide the UI. */
export function profileHasResumeContent(profile: Profile): boolean {
  return (
    profile.experience.length > 0 ||
    profile.projects.length > 0 ||
    profile.skills.length > 0 ||
    !!profile.fullName.trim()
  );
}

export function buildResumeMarkdown(profile: Profile): string {
  const lines: string[] = [];

  // --- Header: name + contact line ---
  if (profile.fullName.trim()) lines.push(`# ${profile.fullName.trim()}`);

  const contact = [
    profile.email,
    profile.phone,
    profile.location,
    profile.linkedin,
    profile.github,
    profile.portfolio,
  ]
    .map((v) => (v ?? "").trim())
    .filter(Boolean);
  if (contact.length) lines.push(contact.join(" · "));

  // --- Education ---
  const eduBits = [
    [profile.degree, profile.major].map((v) => (v ?? "").trim()).filter(Boolean).join(" "),
    profile.university?.trim(),
    profile.graduationDate?.trim(),
    profile.gpa?.trim() ? `GPA: ${profile.gpa.trim()}` : "",
  ].filter(Boolean);
  if (eduBits.length) {
    lines.push("", "## Education", eduBits.join(" · "));
  }

  // --- Skills ---
  if (profile.skills.length) {
    lines.push("", "## Skills", profile.skills.join(", "));
  }

  // --- Experience ---
  if (profile.experience.length) {
    lines.push("", "## Experience");
    for (const e of profile.experience) {
      const heading = [e.title?.trim(), e.company?.trim()]
        .filter(Boolean)
        .join(" — ");
      const range = dateRange(e.startDate, e.endDate);
      lines.push("", `### ${heading || "Role"}${range ? ` (${range})` : ""}`);
      if (e.location?.trim()) lines.push(`*${e.location.trim()}*`);
      for (const b of e.bullets) {
        if (b.trim()) lines.push(`- ${b.trim()}`);
      }
    }
  }

  // --- Projects ---
  if (profile.projects.length) {
    lines.push("", "## Projects");
    for (const p of profile.projects) {
      const name = p.name?.trim() || "Project";
      lines.push("", p.link?.trim() ? `### [${name}](${p.link.trim()})` : `### ${name}`);
      if (p.description?.trim()) lines.push(p.description.trim());
      for (const b of p.bullets) {
        if (b.trim()) lines.push(`- ${b.trim()}`);
      }
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
