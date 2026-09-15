// ---------------------------------------------------------------------------
// Parse a Markdown resume into a structured document so it can be rendered in a
// single, consistent, ATS-safe layout (Jake's-template style).
//
// Canonical format the AI is asked to produce (the parser is also tolerant of
// common variations):
//
//   # Full Name
//   email | phone | linkedin.com/in/x | github.com/x
//
//   ## Education
//   ### University Name | City, State
//   B.S. in Something | Aug 2024 – May 2028
//
//   ## Experience
//   ### Job Title | May 2025 – Aug 2025
//   Company | City, State
//   - Did a thing that moved a metric
//
//   ## Projects
//   ### Project Name | Python, React
//   - Built a thing
//
//   ## Technical Skills
//   Languages: Python, TypeScript
//   Frameworks: React, Node.js
//
// Line 1 of an entry ("### Left | Right") renders as bold-left / plain-right.
// Line 2 ("Left | Right") renders as italic-left / italic-right. What goes on
// which side is the AI's choice per section; the renderer stays generic.
// ---------------------------------------------------------------------------

export interface ResumeEntry {
  title: string; // bold, left, line 1
  titleRight?: string; // plain, right, line 1 (usually dates)
  subtitle?: string; // italic, left, line 2 (usually company/degree)
  subtitleRight?: string; // italic, right, line 2 (usually location/dates)
  bullets: string[];
}

export interface ResumeLine {
  label?: string; // bold prefix, e.g. "Languages:"
  text: string;
}

export interface ResumeSection {
  heading: string;
  entries: ResumeEntry[];
  lines: ResumeLine[]; // skills / summary text that isn't an entry
}

export interface ResumeDoc {
  name: string;
  contact: string[];
  sections: ResumeSection[];
}

const KNOWN_SECTIONS = new Set([
  "summary",
  "objective",
  "profile",
  "education",
  "experience",
  "work experience",
  "professional experience",
  "projects",
  "skills",
  "technical skills",
  "certifications",
  "awards",
  "leadership",
  "activities",
  "publications",
  "coursework",
]);

// Trailing date range like "May 2024 – Aug 2024", "2024 – Present", "2025".
const DATE_TAIL =
  /\s+((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*\s*\d{4}|\d{4}|Present)(?:\s*[–—-]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*\s*\d{4}|\d{4}|Present))?)\s*$/i;

function stripInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .trim();
}

// Split on an explicit " | " separator only.
function splitPipe(line: string): { left: string; right?: string } {
  const t = line.trim();
  const bar = t.lastIndexOf(" | ");
  if (bar !== -1) {
    return { left: t.slice(0, bar).trim(), right: t.slice(bar + 3).trim() };
  }
  return { left: t };
}

// Split a TITLE line into left/right: prefer " | ", else peel a trailing date
// range (only appropriate for the title, not for subtitle lines which may BE a
// date, e.g. "May 2026 – Present").
function splitLeftRight(line: string): { left: string; right?: string } {
  const piped = splitPipe(line);
  if (piped.right !== undefined) return piped;
  const m = line.trim().match(DATE_TAIL);
  if (m) {
    return { left: line.trim().slice(0, m.index).trim(), right: m[1].trim() };
  }
  return piped;
}

function headingText(raw: string): string | null {
  const t = raw.trim();
  const h = t.match(/^#{2,3}\s+(.*)$/); // ## or ###
  if (h) return stripInline(h[1]).replace(/:$/, "");
  const plain = stripInline(t).replace(/:$/, "");
  if (KNOWN_SECTIONS.has(plain.toLowerCase())) return plain;
  // Whole-line bold section label, e.g. **Experience**
  if (/^\*\*[^*]+\*\*:?$/.test(t) && plain.split(/\s+/).length <= 3) return plain;
  // Short ALL-CAPS line, e.g. EXPERIENCE
  if (plain.length <= 28 && plain === plain.toUpperCase() && /[A-Z]/.test(plain))
    return plain;
  return null;
}

function isSectionHeading(raw: string): boolean {
  const t = raw.trim();
  if (/^##\s+/.test(t)) return true;
  const h = headingText(t);
  return h != null && KNOWN_SECTIONS.has(h.toLowerCase()) && !/^###\s+/.test(t);
}

// An entry heading: "### ...", a bold line that isn't a known section, or a line
// that carries a " | " / trailing date (a role/school line).
function isEntryHeading(raw: string): boolean {
  const t = raw.trim();
  if (/^###\s+/.test(t)) return true;
  if (isSectionHeading(t)) return false;
  if (/^\*\*[^*]+\*\*/.test(t)) return true;
  if (t.includes(" | ")) return true;
  if (DATE_TAIL.test(t)) return true;
  return false;
}

function isBullet(raw: string): boolean {
  return /^\s*[-*•]\s+/.test(raw);
}

function bulletText(raw: string): string {
  return stripInline(raw.replace(/^\s*[-*•]\s+/, ""));
}

export function parseResumeDoc(markdown: string): ResumeDoc {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const doc: ResumeDoc = { name: "", contact: [], sections: [] };

  let i = 0;
  // Skip leading blanks / stray preamble ("Here is the resume:").
  while (i < lines.length && !lines[i].trim()) i++;

  // Name: first "# X" or first non-empty line.
  if (i < lines.length) {
    const t = lines[i].trim();
    const h1 = t.match(/^#\s+(.*)$/);
    doc.name = stripInline(h1 ? h1[1] : t.replace(/^#+\s*/, ""));
    i++;
  }

  // Contact: next non-empty line that isn't a section/entry heading or bullet.
  while (i < lines.length && !lines[i].trim()) i++;
  if (
    i < lines.length &&
    !isSectionHeading(lines[i]) &&
    !/^###\s+/.test(lines[i].trim()) &&
    !isBullet(lines[i])
  ) {
    doc.contact = stripInline(lines[i])
      .split(/\s*[|•·]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    i++;
  }

  let section: ResumeSection | null = null;
  let entry: ResumeEntry | null = null;
  // True immediately after an entry's title line, so the very next heading-like
  // line folds into that entry's subtitle instead of starting a new entry —
  // this handles small models that emit the company/degree line as its own
  // "### ..." heading.
  let openedHeading = false;

  const pushSection = (heading: string) => {
    section = { heading, entries: [], lines: [] };
    doc.sections.push(section);
    entry = null;
    openedHeading = false;
  };

  for (; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) continue;
    if (/^([-*_=])\1{2,}$/.test(t)) continue; // horizontal rule

    if (isSectionHeading(raw)) {
      pushSection(headingText(raw) ?? t.replace(/^#+\s*/, ""));
      continue;
    }

    if (!section) pushSection("Summary"); // content before any header

    if (isBullet(raw)) {
      if (entry) entry.bullets.push(bulletText(raw));
      else section!.lines.push({ text: bulletText(raw) });
      openedHeading = false;
      continue;
    }

    if (isEntryHeading(raw)) {
      const { left, right } = splitLeftRight(
        stripInline(raw.replace(/^#{2,3}\s+/, "")),
      );
      // Second heading-like line right under a title → the entry's subtitle
      // (pipe-split only; the line may itself be a date range).
      if (entry && openedHeading && !entry.subtitle && entry.bullets.length === 0) {
        const sub = splitPipe(stripInline(raw.replace(/^#{2,3}\s+/, "")));
        entry.subtitle = sub.left;
        entry.subtitleRight = sub.right;
        openedHeading = false;
      } else {
        entry = { title: left, titleRight: right, bullets: [] };
        section!.entries.push(entry);
        openedHeading = true;
      }
      continue;
    }

    // A plain (non-heading) line right after an entry header is its subtitle.
    if (entry && !entry.subtitle && entry.bullets.length === 0) {
      const { left, right } = splitPipe(stripInline(raw));
      entry.subtitle = left;
      entry.subtitleRight = right;
      openedHeading = false;
      continue;
    }
    openedHeading = false;

    // "Label: value" (skills) vs a plain paragraph (summary).
    const label = t.match(/^([A-Za-z][\w /&+-]{0,30}):\s+(.*)$/);
    if (label) {
      section!.lines.push({ label: `${label[1]}:`, text: stripInline(label[2]) });
    } else {
      section!.lines.push({ text: stripInline(t) });
    }
  }

  return doc;
}
