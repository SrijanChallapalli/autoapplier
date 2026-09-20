// ---------------------------------------------------------------------------
// A small, dependency-free Markdown renderer tuned for resumes. Resume Markdown
// is simple — headings, bullet lists, bold/italic, links, and rules — so we
// render just that, and always escape text first so AI/user content can't
// inject markup. Used both for the live preview and for the printable PDF doc.
// ---------------------------------------------------------------------------

import { parseResumeDoc } from "./resumeParse";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Only allow safe link schemes; anything else becomes an inert anchor.
function safeHref(url: string): string {
  const u = url.trim();
  if (/^(https?:\/\/|mailto:)/i.test(u)) return u;
  if (/^www\./i.test(u)) return `https://${u}`;
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(u)) return `mailto:${u}`;
  return "#";
}

// Inline formatting on a single (already block-split) line of text.
function inline(raw: string): string {
  let s = escapeHtml(raw);
  // [text](url)
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, text, url) =>
      `<a href="${safeHref(url)}" target="_blank" rel="noreferrer">${text}</a>`,
  );
  // **bold** and __bold__
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // *italic* (single asterisk, not part of a bold pair)
  s = s.replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, "$1<em>$2</em>");
  return s;
}

const BULLET_RE = /^\s*[-*•·]\s+(.*)$/;
const HR_RE = /^\s*([-*_])\1{2,}\s*$/; // ---, ***, ___

// Render resume Markdown to an HTML fragment (the inner body of the page).
export function renderResumeHtml(md: string): string {
  const lines = (md ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let listItems: string[] | null = null;
  let paragraph: string[] | null = null;

  const flushList = () => {
    if (listItems) {
      out.push(`<ul>${listItems.map((li) => `<li>${li}</li>`).join("")}</ul>`);
      listItems = null;
    }
  };
  const flushParagraph = () => {
    if (paragraph) {
      out.push(`<p>${paragraph.join(" ")}</p>`);
      paragraph = null;
    }
  };
  const flush = () => {
    flushList();
    flushParagraph();
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (HR_RE.test(line)) {
      flush();
      out.push("<hr />");
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length, 4);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(BULLET_RE);
    if (bullet) {
      flushParagraph();
      (listItems = listItems ?? []).push(inline(bullet[1]));
      continue;
    }
    // Plain text — accumulate into the current paragraph.
    flushList();
    (paragraph = paragraph ?? []).push(inline(line.trim()));
  }
  flush();
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Structured resume renderer — the on-screen twin of the PDF export.
//
// The live preview used to run the raw Markdown through the generic renderer
// above, which knows nothing about entry headers, dates, or the two-column
// "Jake's-template" layout — so the preview looked nothing like the PDF you
// download. This renders from the SAME parsed structure the PDF uses
// (parseResumeDoc), so the preview is WYSIWYG: centered name, contact line,
// ruled section headings, bold-left / date-right entry headers, italic
// company/location subtitles, and real bullets. Styles are inlined so it looks
// identical in the app preview and in a standalone print document.
// ---------------------------------------------------------------------------

// Turn the parsed structure into HTML matching the PDF's Jake's-template look.
// `scale` lets the print document use slightly larger, print-tuned sizing.
function renderResumeStructure(md: string): string {
  const doc = parseResumeDoc(md);
  const out: string[] = [];

  const row = (
    left: string,
    right: string | undefined,
    opts: { bold?: boolean; italic?: boolean; muted?: boolean },
  ) => {
    const weight = opts.bold ? "font-weight:700;" : "";
    const style = opts.italic ? "font-style:italic;" : "";
    const color = opts.muted ? "color:#374151;" : "";
    const rightHtml = right
      ? `<span style="white-space:nowrap;padding-left:12px;${style}${color}">${escapeHtml(
          right,
        )}</span>`
      : "";
    return `<div class="rr-row" style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:2px 0 0;"><span style="${weight}${style}${color}">${escapeHtml(
      left,
    )}</span>${rightHtml}</div>`;
  };

  if (doc.name) {
    out.push(
      `<div class="rr-name" style="text-align:center;font-size:1.85em;font-weight:700;letter-spacing:.01em;margin:0 0 3px;">${escapeHtml(
        doc.name,
      )}</div>`,
    );
  }
  if (doc.contact.length) {
    const items = doc.contact
      .map((c) => escapeHtml(c))
      .join('<span style="color:#9ca3af;padding:0 4px;">|</span>');
    out.push(
      `<div class="rr-contact" style="text-align:center;color:#374151;font-size:.92em;margin:0 0 12px;overflow-wrap:anywhere;">${items}</div>`,
    );
  }

  for (const section of doc.sections) {
    out.push('<div class="rr-section" style="margin:13px 0 0;">');
    out.push(
      `<div class="rr-head" style="text-transform:uppercase;font-weight:700;font-size:.95em;letter-spacing:.06em;border-bottom:1px solid #111827;padding-bottom:2px;margin:0 0 6px;">${escapeHtml(
        section.heading,
      )}</div>`,
    );

    for (const line of section.lines) {
      if (line.label) {
        out.push(
          `<div style="margin:0 0 3px;"><strong>${escapeHtml(
            line.label,
          )}</strong> ${escapeHtml(line.text)}</div>`,
        );
      } else {
        out.push(`<div style="margin:0 0 4px;">${escapeHtml(line.text)}</div>`);
      }
    }

    section.entries.forEach((entry, idx) => {
      const top = idx > 0 || section.lines.length ? "6px" : "3px";
      out.push(`<div class="rr-entry" style="margin:${top} 0 0;">`);
      out.push(row(entry.title, entry.titleRight, { bold: true }));
      if (entry.subtitle) {
        out.push(
          row(entry.subtitle, entry.subtitleRight, { italic: true, muted: true }),
        );
      }
      if (entry.bullets.length) {
        out.push(
          `<ul style="margin:3px 0 0;padding-left:18px;">${entry.bullets
            .map(
              (b) =>
                `<li style="margin:0 0 2px;">${escapeHtml(b)}</li>`,
            )
            .join("")}</ul>`,
        );
      }
      out.push("</div>");
    });

    out.push("</div>");
  }

  return out.join("\n");
}

// Render resume Markdown to the structured, PDF-matching HTML used by the
// editor preview. Wraps the body in a serif container so it mirrors the PDF's
// Times layout. Falls back to the generic renderer only if parsing yields
// nothing usable (e.g. a stray note with no name or sections).
export function renderResumeDocHtml(md: string): string {
  const structured = renderResumeStructure(md);
  if (!structured.trim()) return renderResumeHtml(md);
  return `<div class="rr-doc" style="font-family:Georgia,'Times New Roman',Times,serif;line-height:1.42;">${structured}</div>`;
}

// A complete, self-contained HTML document for printing / saving as PDF.
// Styles are embedded so it renders identically in a print iframe with no
// dependency on the app's stylesheet.
export function resumePrintDocument(md: string, title: string): string {
  const body = renderResumeDocHtml(md);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: letter; margin: 0.5in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Georgia, "Times New Roman", Times, serif;
    color: #111827;
    font-size: 10.5pt;
    line-height: 1.4;
  }
  .doc { max-width: 7.5in; margin: 0 auto; }
  h1 {
    font-size: 20pt; font-weight: 700; text-align: center;
    margin: 0 0 2pt; letter-spacing: 0.01em;
  }
  /* The contact line usually follows the name as a paragraph. */
  h1 + p { text-align: center; color: #4b5563; font-size: 9.5pt; margin: 0 0 10pt; }
  h2 {
    font-size: 10.5pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; color: #111827;
    border-bottom: 1px solid #9ca3af;
    padding-bottom: 2pt; margin: 13pt 0 6pt;
  }
  h3 { font-size: 11pt; font-weight: 700; margin: 8pt 0 2pt; }
  h4 { font-size: 10.5pt; font-weight: 600; margin: 6pt 0 2pt; }
  p { margin: 0 0 5pt; }
  ul { margin: 3pt 0 7pt; padding-left: 16pt; }
  li { margin: 0 0 2.5pt; }
  a { color: #1d4ed8; text-decoration: none; }
  hr { border: none; border-top: 1px solid #d1d5db; margin: 8pt 0; }
  strong { font-weight: 700; }
</style>
</head>
<body><div class="doc">${body}</div></body>
</html>`;
}
