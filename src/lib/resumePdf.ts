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
const MARGIN = 36; // 0.5"
const RIGHT = PAGE_W - MARGIN; // 576
const CONTENT_W = PAGE_W - MARGIN * 2; // 540
const BULLET_INDENT = 12; // glyph offset from margin
const BULLET_TEXT = 24; // text offset from margin

const FONT = "times";

export function renderResume(doc: jsPDF, markdown: string): void {
  const r = parseResumeDoc(markdown);
  let y = MARGIN + 4;

  const space = (h: number) => {
    if (y + h > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN + 4;
    }
  };

  // ---- Name (centered, bold) ----
  if (r.name) {
    doc.setFont(FONT, "bold");
    doc.setFontSize(22);
    doc.setTextColor(0);
    space(24);
    doc.text(r.name, PAGE_W / 2, y, { align: "center" });
    y += 16;
  }

  // ---- Contact line (centered) ----
  if (r.contact.length) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(10);
    doc.setTextColor(30);
    space(12);
    doc.text(r.contact.join("   |   "), PAGE_W / 2, y, { align: "center" });
    y += 14;
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
    space(size * 1.3);
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
    y += size * 1.3;
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

    // ---- Free lines (skills / summary) ----
    for (const line of section.lines) {
      doc.setFontSize(10);
      space(13);
      if (line.label) {
        doc.setFont(FONT, "bold");
        doc.text(line.label, MARGIN, y);
        const labelW = doc.getTextWidth(line.label + " ");
        doc.setFont(FONT, "normal");
        const wrapped = doc.splitTextToSize(line.text, CONTENT_W - labelW);
        doc.text(wrapped[0] ?? "", MARGIN + labelW, y);
        y += 13;
        for (let k = 1; k < wrapped.length; k++) {
          space(13);
          doc.text(wrapped[k], MARGIN, y);
          y += 13;
        }
      } else {
        doc.setFont(FONT, "normal");
        const wrapped = doc.splitTextToSize(line.text, CONTENT_W);
        for (const w of wrapped) {
          space(13);
          doc.text(w, MARGIN, y);
          y += 13;
        }
      }
    }

    // ---- Entries ----
    for (const entry of section.entries) {
      if (section.entries.indexOf(entry) > 0 || section.lines.length) y += 3;
      twoCol(entry.title, entry.titleRight, 11, "bold");
      if (entry.subtitle) {
        twoCol(entry.subtitle, entry.subtitleRight, 10, "italic");
      }
      // Bullets — real "•" character, hanging indent.
      doc.setFont(FONT, "normal");
      doc.setFontSize(10);
      for (const b of entry.bullets) {
        const wrapped = doc.splitTextToSize(b, CONTENT_W - BULLET_TEXT);
        wrapped.forEach((w: string, idx: number) => {
          space(12);
          if (idx === 0) doc.text("•", MARGIN + BULLET_INDENT, y);
          doc.text(w, MARGIN + BULLET_TEXT, y);
          y += 12;
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
