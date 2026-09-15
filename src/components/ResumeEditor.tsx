"use client";

import { useMemo, useRef, useState } from "react";
import { renderResumeHtml, resumePrintDocument } from "@/lib/markdown";

type Mode = "split" | "edit" | "preview";

export function ResumeEditor({
  value,
  onChange,
  onSave,
  fileBase,
  onFlash,
}: {
  value: string;
  // Fired on every keystroke (keeps parent state live).
  onChange: (text: string) => void;
  // Fired when edits should be persisted (on blur).
  onSave: (text: string) => void;
  // Base name for downloaded files, e.g. "Jane Doe — Acme".
  fileBase: string;
  onFlash?: (msg: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("split");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const previewHtml = useMemo(() => renderResumeHtml(value), [value]);
  const hasContent = value.trim().length > 0;

  // Wrap/insert Markdown around the current selection in the textarea.
  function applyFormat(kind: "h2" | "h3" | "bold" | "bullet" | "link") {
    const el = textarea.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const sel = value.slice(start, end);
    let replacement = sel;
    let caretOffset = 0;

    if (kind === "bold") {
      replacement = `**${sel || "bold text"}**`;
      caretOffset = sel ? replacement.length : 2 + "bold text".length;
    } else if (kind === "link") {
      const label = sel || "link text";
      replacement = `[${label}](https://)`;
      caretOffset = replacement.length;
    } else {
      // Line-oriented formats: apply at the start of each selected line.
      const prefix =
        kind === "h2" ? "## " : kind === "h3" ? "### " : "- ";
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const block = value.slice(lineStart, end || start);
      const formatted = (block || "text")
        .split("\n")
        .map((l) => prefix + l.replace(/^\s*(#{1,4}\s+|[-*•]\s+)/, ""))
        .join("\n");
      const next = value.slice(0, lineStart) + formatted + value.slice(end || start);
      commit(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(lineStart, lineStart + formatted.length);
      });
      return;
    }

    const next = value.slice(0, start) + replacement + value.slice(end);
    commit(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + caretOffset;
      el.setSelectionRange(pos, sel ? pos : start + 2 + (kind === "bold" ? "bold text".length : 0));
    });
  }

  function commit(next: string) {
    onChange(next);
    onSave(next);
  }

  function download(kind: "pdf" | "md") {
    if (!hasContent) {
      onFlash?.("Nothing to download yet — tailor or write a resume first");
      return;
    }
    const safeName = (fileBase || "resume").replace(/[^\w\-— ]+/g, "").trim() || "resume";
    if (kind === "md") {
      const blob = new Blob([value], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}.md`;
      a.click();
      URL.revokeObjectURL(url);
      onFlash?.("Downloaded Markdown");
      return;
    }
    // PDF: render into a hidden iframe and invoke the browser's print dialog,
    // where the user chooses "Save as PDF". No dependencies, real PDF output,
    // and the iframe avoids popup blockers.
    printResume(resumePrintDocument(value, safeName));
  }

  return (
    <div className="resume-editor">
      <div className="resume-toolbar">
        <div className="seg" role="tablist" aria-label="View mode">
          {(["edit", "split", "preview"] as Mode[]).map((m) => (
            <button
              key={m}
              className={`seg-btn${mode === m ? " active" : ""}`}
              onClick={() => setMode(m)}
              aria-selected={mode === m}
            >
              {m === "edit" ? "Edit" : m === "split" ? "Split" : "Preview"}
            </button>
          ))}
        </div>

        {mode !== "preview" && (
          <div className="fmt-tools" role="toolbar" aria-label="Formatting">
            <button className="fmt-btn" title="Section heading" onClick={() => applyFormat("h2")}>
              Section
            </button>
            <button className="fmt-btn" title="Entry / role heading" onClick={() => applyFormat("h3")}>
              Entry
            </button>
            <button className="fmt-btn" title="Bold (⌘/Ctrl-B)" onClick={() => applyFormat("bold")}>
              <strong>B</strong>
            </button>
            <button className="fmt-btn" title="Bullet point" onClick={() => applyFormat("bullet")}>
              • List
            </button>
            <button className="fmt-btn" title="Link" onClick={() => applyFormat("link")}>
              Link
            </button>
          </div>
        )}

        <div className="dl-tools">
          <button className="btn btn-sm btn-primary" onClick={() => download("pdf")}>
            ⬇ Download PDF
          </button>
          <button className="btn btn-sm" onClick={() => download("md")} title="Download Markdown source">
            .md
          </button>
          <button
            className="btn btn-sm"
            title="Copy resume text"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value);
                onFlash?.("Resume copied");
              } catch {
                onFlash?.("Copy blocked — select the text manually");
              }
            }}
          >
            ⧉ Copy
          </button>
        </div>
      </div>

      <div className={`resume-body mode-${mode}`}>
        {mode !== "preview" && (
          <textarea
            ref={textarea}
            className="resume-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onSave(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
                e.preventDefault();
                applyFormat("bold");
              }
            }}
            placeholder="Tailor a resume above, or start writing. Use ## for sections, ### for roles, and - for bullets…"
            spellCheck
          />
        )}
        {mode !== "edit" && (
          <div className="resume-preview-wrap">
            {hasContent ? (
              <div
                className="resume-page"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <div className="resume-page resume-empty">
                <p className="muted" style={{ textAlign: "center", marginTop: 60 }}>
                  Your resume preview will appear here.
                  <br />
                  Tailor for the role, or start typing on the left.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Print a full HTML document via a temporary hidden iframe.
function printResume(docHtml: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const cleanup = () => {
    setTimeout(() => frame.remove(), 1000);
  };

  const doc = frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(docHtml);
  doc.close();

  const go = () => {
    const win = frame.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
    cleanup();
  };
  // Give the iframe a tick to lay out before printing.
  if (frame.contentWindow?.document.readyState === "complete") {
    setTimeout(go, 150);
  } else {
    frame.onload = () => setTimeout(go, 150);
  }
}
