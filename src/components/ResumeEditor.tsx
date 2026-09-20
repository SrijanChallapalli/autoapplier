"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeHunks,
  changedHunks,
  applyHunks,
  type Hunk,
} from "@/lib/resumeDiff";
import { downloadResumePdf, resumeFileName } from "@/lib/resumePdf";
import { renderResumeDocHtml } from "@/lib/markdown";

type Mode = "auto" | "review";
type View = "edit" | "split" | "preview";
const MODE_LS = "autoapplier.resumeEditMode";
const VIEW_LS = "autoapplier.resumeView";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const QUICK = [
  "Tailor my resume to this role",
  "Make my bullets stronger and more quantified",
  "What keywords am I missing for ATS?",
  "Rewrite my summary for this job",
];

// Pull a full resume out of an assistant reply: a fenced ```resume/```markdown
// block if present, otherwise (fallback for models that skip the fence) the
// whole reply when it clearly IS a complete resume — at least three standard
// sections — with any leading "Here's the resume:" preamble stripped.
function extractResume(text: string): string | null {
  const fenced = text.match(/```(?:resume|markdown|md)?\s*\n([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const sections = (
    text.match(
      /^\s*(summary|objective|profile|skills|experience|projects|education|certifications)\b/gim,
    ) || []
  ).length;
  if (sections >= 3) {
    return text.replace(/^\s*[^\n]*:\s*\n+/, "").trim();
  }
  return null;
}

export function ResumeEditor({
  appId,
  company,
  title,
  resumeLabel,
  initialResume,
  onSave,
  onFlash,
}: {
  appId: string;
  company?: string;
  title?: string;
  resumeLabel?: string;
  initialResume: string;
  onSave: (resume: string) => void;
  onFlash: (msg: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("auto");
  const [view, setView] = useState<View>("split");
  const [resume, setResume] = useState(initialResume);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Chat state
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Review state: a pending proposal with per-change decisions.
  const [hunks, setHunks] = useState<Hunk[] | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());

  const previewHtml = useMemo(() => renderResumeDocHtml(resume), [resume]);
  const hasContent = resume.trim().length > 0;

  useEffect(() => {
    try {
      const savedMode = localStorage.getItem(MODE_LS);
      if (savedMode === "auto" || savedMode === "review") setMode(savedMode);
      const savedView = localStorage.getItem(VIEW_LS);
      if (savedView === "edit" || savedView === "split" || savedView === "preview")
        setView(savedView);
    } catch {
      /* ignore */
    }
  }, []);

  function changeMode(m: Mode) {
    setMode(m);
    try {
      localStorage.setItem(MODE_LS, m);
    } catch {
      /* ignore */
    }
  }

  function changeView(v: View) {
    setView(v);
    try {
      localStorage.setItem(VIEW_LS, v);
    } catch {
      /* ignore */
    }
  }

  const pending = useMemo(
    () => (hunks ? changedHunks(hunks) : []),
    [hunks],
  );

  function commit(next: string) {
    setResume(next);
    onSave(next);
  }

  // Wrap/insert Markdown around the current selection in the textarea.
  function applyFormat(kind: "h2" | "h3" | "bold" | "bullet" | "link") {
    const el = textarea.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const sel = resume.slice(start, end);

    if (kind === "bold" || kind === "link") {
      const replacement =
        kind === "bold"
          ? `**${sel || "bold text"}**`
          : `[${sel || "link text"}](https://)`;
      const next = resume.slice(0, start) + replacement + resume.slice(end);
      commit(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start, start + replacement.length);
      });
      return;
    }

    // Line-oriented formats: apply at the start of each selected line.
    const prefix = kind === "h2" ? "## " : kind === "h3" ? "### " : "- ";
    const lineStart = resume.lastIndexOf("\n", start - 1) + 1;
    const block = resume.slice(lineStart, end || start);
    const formatted = (block || "text")
      .split("\n")
      .map((l) => prefix + l.replace(/^\s*(#{1,4}\s+|[-*•]\s+)/, ""))
      .join("\n");
    const next =
      resume.slice(0, lineStart) + formatted + resume.slice(end || start);
    commit(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(lineStart, lineStart + formatted.length);
    });
  }

  // A newly proposed full resume from the AI (via chat or the Tailor button).
  function handleProposal(proposed: string) {
    const current = resume.trim();
    if (!current) {
      // Nothing to diff against — accept the first draft outright.
      commit(proposed);
      onFlash("Resume draft applied");
      return;
    }
    if (mode === "auto") {
      commit(proposed);
      onFlash("Changes applied automatically");
      return;
    }
    const hs = computeHunks(current, proposed);
    const changes = changedHunks(hs);
    if (changes.length === 0) {
      onFlash("The AI didn't suggest any changes");
      return;
    }
    setHunks(hs);
    setAccepted(new Set(changes.map((h) => h.id))); // default: all checked
  }

  function applyReviewed() {
    if (!hunks) return;
    const next = applyHunks(hunks, accepted);
    commit(next);
    setHunks(null);
    setAccepted(new Set());
    onFlash(
      `Applied ${accepted.size} of ${pending.length} change${
        pending.length === 1 ? "" : "s"
      }`,
    );
  }

  function toggle(id: number) {
    setAccepted((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function tailor() {
    setTailoring(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${appId}/tailor-resume`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.tailoredResume) handleProposal(data.tailoredResume as string);
      else setError(data.error ?? "Couldn't tailor resume");
    } catch {
      setError("Tailoring failed — try again.");
    } finally {
      setTailoring(false);
    }
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setError(null);
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`/api/applications/${appId}/resume-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, currentResume: resume }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
        const proposed = extractResume(data.reply);
        if (proposed) handleProposal(proposed);
        setTimeout(
          () => scroller.current?.scrollTo({ top: 1e9, behavior: "smooth" }),
          50,
        );
      } else {
        setError(data.error ?? "Chat failed");
      }
    } catch {
      setError("Chat failed — try again.");
    } finally {
      setSending(false);
    }
  }

  async function download() {
    if (!resume.trim()) {
      onFlash("Nothing to export yet — generate a resume first");
      return;
    }
    try {
      await downloadResumePdf(resume, resumeFileName(company, title));
      onFlash("PDF downloaded");
    } catch {
      onFlash("Couldn't generate the PDF");
    }
  }

  const busy = sending || tailoring;

  return (
    <div>
      {/* Header: title, mode toggle, actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div className="section-label" style={{ marginTop: 0 }}>
          Resume editor ({resumeLabel ?? "no base resume"})
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <div
            className="row"
            style={{
              gap: 0,
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
            }}
            role="group"
            aria-label="Edit mode"
          >
            <button
              className="btn btn-sm"
              onClick={() => changeMode("auto")}
              aria-pressed={mode === "auto"}
              style={{
                borderRadius: 0,
                border: "none",
                background: mode === "auto" ? "var(--primary)" : "transparent",
                color: mode === "auto" ? "#fff" : "var(--text)",
              }}
              title="AI edits apply automatically"
            >
              ⚡ Auto
            </button>
            <button
              className="btn btn-sm"
              onClick={() => changeMode("review")}
              aria-pressed={mode === "review"}
              style={{
                borderRadius: 0,
                border: "none",
                background: mode === "review" ? "var(--primary)" : "transparent",
                color: mode === "review" ? "#fff" : "var(--text)",
              }}
              title="Approve each change before it's applied"
            >
              ✓ Review
            </button>
          </div>
          <button className="btn btn-sm" onClick={tailor} disabled={busy}>
            {tailoring ? "Tailoring…" : "✨ Tailor for this role"}
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={download}
            disabled={!resume.trim()}
          >
            ⬇ Download PDF
          </button>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
        {mode === "auto"
          ? "Auto mode: the AI's edits are applied to your resume immediately."
          : "Review mode: approve or reject each change before it's applied."}{" "}
        Edits only ever use your <em>real</em> experience — never invented.
      </p>

      {/* Review panel: appears when there are pending changes to approve */}
      {hunks && pending.length > 0 && (
        <div
          style={{
            border: "1px solid var(--primary)",
            borderRadius: 10,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <strong>
              {pending.length} proposed change{pending.length === 1 ? "" : "s"} —{" "}
              {accepted.size} selected
            </strong>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <button
                className="btn btn-sm"
                onClick={() => setAccepted(new Set(pending.map((h) => h.id)))}
              >
                Select all
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setAccepted(new Set())}
              >
                Select none
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={applyReviewed}
              >
                Apply {accepted.size} change{accepted.size === 1 ? "" : "s"}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setHunks(null);
                  setAccepted(new Set());
                }}
              >
                Discard
              </button>
            </div>
          </div>

          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: 380,
              overflowY: "auto",
            }}
          >
            {pending.map((h) => (
              <label
                key={h.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  background: "var(--surface-2)",
                  borderRadius: 8,
                  padding: 10,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={accepted.has(h.id)}
                  onChange={() => toggle(h.id)}
                  style={{ marginTop: 3 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="faint"
                    style={{ fontSize: 11, marginBottom: 4 }}
                  >
                    {h.kind === "change"
                      ? "Edit"
                      : h.kind === "add"
                        ? "Addition"
                        : "Removal"}
                  </div>
                  {h.before.length > 0 && (
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        fontSize: 12.5,
                        fontFamily: "ui-monospace, monospace",
                        color: "var(--red, #c0392b)",
                        textDecoration:
                          h.kind === "del" ? "line-through" : "none",
                        background: "rgba(192,57,43,0.08)",
                        borderRadius: 5,
                        padding: "3px 6px",
                        marginBottom: h.after.length > 0 ? 4 : 0,
                      }}
                    >
                      {h.before.join("\n")}
                    </div>
                  )}
                  {h.after.length > 0 && (
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        fontSize: 12.5,
                        fontFamily: "ui-monospace, monospace",
                        color: "var(--green, #1e7e34)",
                        background: "rgba(30,126,52,0.09)",
                        borderRadius: 5,
                        padding: "3px 6px",
                      }}
                    >
                      {h.after.join("\n")}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Working area: Edit / Split / Preview with a live paper preview */}
      <div className="resume-editor">
        <div className="resume-toolbar">
          <div className="seg" role="tablist" aria-label="View mode">
            {(["edit", "split", "preview"] as View[]).map((v) => (
              <button
                key={v}
                className={`seg-btn${view === v ? " active" : ""}`}
                onClick={() => changeView(v)}
                aria-selected={view === v}
              >
                {v === "edit" ? "Edit" : v === "split" ? "Split" : "Preview"}
              </button>
            ))}
          </div>

          {view !== "preview" && (
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
        </div>

        <div className={`resume-body mode-${view}`}>
          {view !== "preview" && (
            <textarea
              ref={textarea}
              className="resume-input"
              value={resume}
              onChange={(e) => setResume(e.target.value)}
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
          {view !== "edit" && (
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

      {/* Chat */}
      <div className="section-label">Chat to improve it</div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {QUICK.map((q) => (
          <button
            key={q}
            className="btn btn-sm"
            disabled={busy}
            onClick={() => send(q)}
          >
            {q}
          </button>
        ))}
      </div>

      {messages.length > 0 && (
        <div
          ref={scroller}
          style={{
            maxHeight: 320,
            overflowY: "auto",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {messages.map((m, i) => {
            const proposed =
              m.role === "assistant" ? extractResume(m.content) : null;
            const prose = proposed
              ? m.content.replace(/```[\s\S]*?```/g, "").trim()
              : m.content;
            return (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                }}
              >
                <div
                  style={{
                    background:
                      m.role === "user" ? "var(--primary)" : "var(--surface-2)",
                    color: m.role === "user" ? "#fff" : "var(--text)",
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontSize: 14,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {prose ||
                    (proposed
                      ? mode === "auto"
                        ? "Applied an updated resume."
                        : "Proposed changes for your review above."
                      : "")}
                </div>
              </div>
            );
          })}
          {sending && <div className="muted">Thinking…</div>}
        </div>
      )}

      <div className="row" style={{ gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send(input);
          }}
          placeholder="Ask for edits, e.g. 'emphasize my ML projects'…"
          disabled={busy}
        />
        <button
          className="btn btn-primary"
          disabled={busy || !input.trim()}
          onClick={() => send(input)}
        >
          Send
        </button>
      </div>
      {error && (
        <p className="muted" style={{ color: "var(--amber)", marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}
