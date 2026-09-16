// ---------------------------------------------------------------------------
// Render a resume to a real, ATS-safe PDF in the "Jake's Resume" layout.
//
// Design follows researched specs (github.com/jakegut/resume) and ATS parsing
// rules: US Letter, 0.5in margins, SINGLE column, serif (Times), centered
// bold name, contact line with " | " separators, small-caps-style section
// headers with a hairline rule, entries as bold-title-left / date-right on one
// line and italic company-left / location-right on the next, and real "•"
// bullet characters in the text layer (never drawn as shapes). No tables, no
// columns, no icons, no images — everything is a single top-to-bottom text flow
// so parsers extract it cleanly and in order.
//
// downloadResumePdf() imports jsPDF lazily (browser only). renderResume() takes
// a jsPDF instance so it can be exercised in Node tests without a DOM.
// ---------------------------------------------------------------------------

import type { jsPDF } from "jspdf";
import { parseResumeDoc, type ResumeDoc } from "./resumeParse";

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const MARGIN = 42; // ~0.58" (spec: 0.55–0.65")
const RIGHT = PAGE_W - MARGIN;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BULLET_INDENT = 12; // glyph offset from margin
const BULLET_TEXT = 24; // text offset from margin

// Typography (Jake's Resume, ATS-safe):
//   name 18pt bold · section headings 11.5pt bold caps · body 10.5pt ·
//   line spacing 1.0 · 4pt between entries.
const FONT = "times"; // jsPDF's built-in Times New Roman
const BODY = 10.5;
const LEAD = 12.5; // single (1.0) line spacing for 10.5pt Times

// ATS: replace unusual dash characters (en/em/figure dash, minus) with a plain
// hyphen so the text layer copies cleanly and parsers don't choke.
function ascii(s: string): string {
  return (s ?? "").replace(/[‐-―−]/g, "-");
}

export function renderResume(doc: jsPDF, markdown: string): void {
  const r = parseResumeDoc(ascii(markdown));
  let y = MARGIN + 4;

  const space = (h: number) => {
    if (y + h > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN + 4;
    }
  };

  // ---- Name (centered, bold, 18pt) ----
  if (r.name) {
    doc.setFont(FONT, "bold");
    doc.setFontSize(18);
    doc.setTextColor(0);
    space(22);
    doc.text(r.name, PAGE_W / 2, y, { align: "center" });
    y += 15;
  }

  // ---- Contact line (centered, plain text URLs) ----
  if (r.contact.length) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(30);
    space(12);
    doc.text(r.contact.join("   |   "), PAGE_W / 2, y, { align: "center" });
    y += 13;
    doc.setTextColor(0);
  }

  // Right-aligned text kept on the SAME baseline as its left text, so the PDF
  // text layer reads "left ... right" on one line (ATS-safe).
  const twoCol = (
    left: string,
    right: string | undefined,
    size: number,
    leftStyle: "bold" | "italic" | "normal",
  ) => {
    doc.setFontSize(size);
    space(size * 1.25);
    doc.setFont(FONT, leftStyle);
    // Keep the left text from colliding with the right text.
    const rightW = right ? doc.getTextWidth(right) : 0;
    const maxLeft = CONTENT_W - rightW - 12;
    const leftLines = doc.splitTextToSize(left, Math.max(60, maxLeft));
    doc.text(leftLines[0], MARGIN, y);
    if (right) {
      doc.setFont(FONT, "normal"); // dates/location: plain, right-aligned
      doc.text(right, RIGHT, y, { align: "right" });
    }
    y += size * 1.25;
  };

  for (const section of r.sections) {
    // ---- Section header + hairline rule ----
    y += 6;
    space(20);
    doc.setFont(FONT, "bold");
    doc.setFontSize(11.5);
    doc.text(section.heading.toUpperCase(), MARGIN, y);
    y += 3;
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, RIGHT, y);
    y += 11;

    // ---- Free lines (skills / summary) — 10.5pt ----
    for (const line of section.lines) {
      doc.setFontSize(BODY);
      space(LEAD);
      if (line.label) {
        doc.setFont(FONT, "bold");
        doc.text(line.label, MARGIN, y);
        const labelW = doc.getTextWidth(line.label + " ");
        doc.setFont(FONT, "normal");
        const wrapped = doc.splitTextToSize(line.text, CONTENT_W - labelW);
        doc.text(wrapped[0] ?? "", MARGIN + labelW, y);
        y += LEAD;
        for (let k = 1; k < wrapped.length; k++) {
          space(LEAD);
          doc.text(wrapped[k], MARGIN, y);
          y += LEAD;
        }
      } else {
        doc.setFont(FONT, "normal");
        const wrapped = doc.splitTextToSize(line.text, CONTENT_W);
        for (const w of wrapped) {
          space(LEAD);
          doc.text(w, MARGIN, y);
          y += LEAD;
        }
      }
    }

    // ---- Entries: bold 10.5pt title / plain date, italic 10.5pt subtitle ----
    for (const entry of section.entries) {
      if (section.entries.indexOf(entry) > 0 || section.lines.length) y += 4;
      twoCol(entry.title, entry.titleRight, BODY, "bold");
      if (entry.subtitle) {
        twoCol(entry.subtitle, entry.subtitleRight, BODY, "italic");
      }
      // Bullets — real round "•" character, hanging indent, 10.5pt.
      doc.setFont(FONT, "normal");
      doc.setFontSize(BODY);
      for (const b of entry.bullets) {
        const wrapped = doc.splitTextToSize(b, CONTENT_W - BULLET_TEXT);
        wrapped.forEach((w: string, idx: number) => {
          space(LEAD);
          if (idx === 0) doc.text("•", MARGIN + BULLET_INDENT, y);
          doc.text(w, MARGIN + BULLET_TEXT, y);
          y += LEAD;
        });
      }
    }
    y += 2;
  }
}

export async function downloadResumePdf(
  markdown: string,
  filename: string,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  renderResume(doc, markdown);
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

// Build a safe file name like "Acme_Software-Engineer_resume.pdf".
export function resumeFileName(company?: string, title?: string): string {
  const part = [company, title]
    .filter(Boolean)
    .join("_")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${part || "resume"}_resume.pdf`;
}

// Re-export for callers/tests that want the parsed structure.
export type { ResumeDoc };
