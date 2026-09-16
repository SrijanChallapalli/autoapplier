// ---------------------------------------------------------------------------
// A small, dependency-free Markdown renderer tuned for resumes. Resume Markdown
// is simple — headings, bullet lists, bold/italic, links, and rules — so we
// render just that, and always escape text first so AI/user content can't
// inject markup. Used both for the live preview and for the printable PDF doc.
// ---------------------------------------------------------------------------

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

// Public alias so the interactive editor can render inline formatting itself.
export function renderInline(raw: string): string {
  return inline(raw);
}

const BULLET_RE = /^\s*[-*•·]\s+(.*)$/;
const HR_RE = /^\s*([-*_])\1{2,}\s*$/; // ---, ***, ___

export type LineKind = "h1" | "h2" | "h3" | "h4" | "bullet" | "p" | "hr" | "blank";

export interface ResumeLine {
  index: number; // source line index in the markdown
  kind: LineKind;
  prefix: string; // markdown prefix to preserve on write-back (e.g. "## ", "- ")
  content: string; // text after the prefix (may contain inline markdown)
  html: string; // inline-rendered HTML of content
}

// Parse resume Markdown into one entry per source line, each carrying the exact
// source index so the interactive editor can edit or AI-rewrite a single line
// and splice it straight back into the markdown without disturbing the rest.
export function parseResumeLines(md: string): ResumeLine[] {
  const lines = (md ?? "").replace(/\r\n?/g, "\n").split("\n");
  return lines.map((line, index) => {
    if (line.trim() === "")
      return { index, kind: "blank", prefix: "", content: "", html: "" };
    if (HR_RE.test(line))
      return { index, kind: "hr", prefix: "", content: "", html: "" };
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      const content = heading[2];
      return {
        index,
        kind: (`h${level}`) as LineKind,
        prefix: "#".repeat(level) + " ",
        content,
        html: inline(content),
      };
    }
    const bullet = line.match(BULLET_RE);
    if (bullet) {
      return {
        index,
        kind: "bullet",
        prefix: "- ",
        content: bullet[1],
        html: inline(bullet[1]),
      };
    }
    const content = line.trim();
    return { index, kind: "p", prefix: "", content, html: inline(content) };
  });
}

// Replace a single source line's content (keeping its markdown prefix) and
// return the new full markdown. Used by inline edits and per-line AI rewrites.
export function replaceResumeLine(
  md: string,
  index: number,
  newContent: string,
  prefix: string,
): string {
  const lines = (md ?? "").replace(/\r\n?/g, "\n").split("\n");
  if (index < 0 || index >= lines.length) return md;
  lines[index] = prefix + newContent;
  return lines.join("\n");
}

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

// A complete, self-contained HTML document for printing / saving as PDF.
// Styles are embedded so it renders identically in a print iframe with no
// dependency on the app's stylesheet.
export function resumePrintDocument(md: string, title: string): string {
  const body = renderResumeHtml(md);
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
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
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
