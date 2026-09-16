"use client";

import { useEffect, useMemo, useRef, useState, type ElementType } from "react";
import {
  computeHunks,
  changedHunks,
  applyHunks,
  type Hunk,
} from "@/lib/resumeDiff";
import { downloadResumePdf, resumeFileName } from "@/lib/resumePdf";
import { parseResumeLines, replaceResumeLine, renderInline, type ResumeLine } from "@/lib/markdown";

type Mode = "auto" | "review";
type View = "edit" | "split" | "preview";
type Tone = "concise" | "impact" | "technical" | "leadership";
type Action = "strengthen" | "quantify" | "shorten" | "match";

const MODE_LS = "autoapplier.resumeEditMode";
const VIEW_LS = "autoapplier.resumeView";
const TONE_LS = "autoapplier.resumeTone";

const TONES: { id: Tone; label: string }[] = [
  { id: "concise", label: "Concise" },
  { id: "impact", label: "Impact-first" },
  { id: "technical", label: "Technical" },
  { id: "leadership", label: "Leadership" },
];

const ACTIONS: { id: Action; label: string; title: string }[] = [
  { id: "strengthen", label: "✨ Strengthen", title: "Stronger verb + clearer impact" },
  { id: "quantify", label: "📊 Quantify", title: "Surface real scope/impact" },
  { id: "shorten", label: "✂ Shorten", title: "Tighten to one crisp line" },
  { id: "match", label: "🎯 Match", title: "Echo the role's keywords (truthfully)" },
];

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
  jobId,
  company,
  title,
  resumeLabel,
  initialResume,
  onSave,
  onFlash,
}: {
  appId: string;
  jobId?: string;
  company?: string;
  title?: string;
  resumeLabel?: string;
  initialResume: string;
  onSave: (resume: string) => void;
  onFlash: (msg: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("auto");
  const [view, setView] = useState<View>("split");
  const [tone, setTone] = useState<Tone>("concise");
  const [resume, setResume] = useState(initialResume);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Chat state
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Review state
  const [hunks, setHunks] = useState<Hunk[] | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());

  // Job keywords for the ATS panel
  const [keywords, setKeywords] = useState<{ required: string[]; nice: string[] } | null>(null);

  const hasContent = resume.trim().length > 0;

  useEffect(() => {
    try {
      const m = localStorage.getItem(MODE_LS);
      if (m === "auto" || m === "review") setMode(m);
      const v = localStorage.getItem(VIEW_LS);
      if (v === "edit" || v === "split" || v === "preview") setView(v);
      const t = localStorage.getItem(TONE_LS);
      if (t && TONES.some((x) => x.id === t)) setTone(t as Tone);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!jobId) return;
    fetch(`/api/jobs/${jobId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((job) => {
        if (job)
          setKeywords({
            required: job.requiredSkills ?? [],
            nice: job.niceToHaveSkills ?? [],
          });
      })
      .catch(() => {});
  }, [jobId]);

  function persistPref(key: string, val: string) {
    try {
      localStorage.setItem(key, val);
    } catch {
      /* ignore */
    }
  }
  function changeMode(m: Mode) {
    setMode(m);
    persistPref(MODE_LS, m);
  }
  function changeView(v: View) {
    setView(v);
    persistPref(VIEW_LS, v);
  }
  function changeTone(t: Tone) {
    setTone(t);
    persistPref(TONE_LS, t);
  }

  const pending = useMemo(() => (hunks ? changedHunks(hunks) : []), [hunks]);

  function commit(next: string) {
    setResume(next);
    onSave(next);
  }

  // --- Live ATS coverage / fit score -------------------------------------
  const coverage = useMemo(() => {
    if (!keywords) return null;
    const text = resume.toLowerCase();
    const present = (k: string) => text.includes(k.toLowerCase());
    const req = keywords.required;
    const nice = keywords.nice;
    const reqHit = req.filter(present);
    const niceHit = nice.filter(present);
    const reqCov = req.length ? reqHit.length / req.length : 1;
    const niceCov = nice.length ? niceHit.length / nice.length : 1;
    const score = Math.round(
      100 * (req.length ? 0.78 * reqCov + 0.22 * niceCov : niceCov),
    );
    return {
      req,
      nice,
      reqHit: new Set(reqHit.map((s) => s.toLowerCase())),
      niceHit: new Set(niceHit.map((s) => s.toLowerCase())),
      reqHitCount: reqHit.length,
      niceHitCount: niceHit.length,
      missingReq: req.filter((k) => !present(k)),
      score: hasContent ? score : 0,
    };
  }, [keywords, resume, hasContent]);

  // --- Per-line AI rewrite (inline hover actions) -------------------------
  async function rewriteLine(line: ResumeLine, action: Action) {
    const res = await fetch(`/api/applications/${appId}/rewrite-line`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: line.content, action, tone }),
    });
    const data = await res.json();
    if (data.text) {
      commit(replaceResumeLine(resume, line.index, data.text, line.prefix));
      onFlash("Line rewritten");
    } else {
      onFlash(data.error ?? "Rewrite failed");
    }
  }

  function editLine(line: ResumeLine, newContent: string) {
    if (newContent === line.content) return;
    commit(replaceResumeLine(resume, line.index, newContent, line.prefix));
  }

  // --- Full-resume proposals (chat / tailor) ------------------------------
  function handleProposal(proposed: string) {
    const current = resume.trim();
    if (!current) {
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
    setAccepted(new Set(changes.map((h) => h.id)));
  }

  function applyReviewed() {
    if (!hunks) return;
    commit(applyHunks(hunks, accepted));
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
          <div className="mode-seg" role="group" aria-label="Edit mode">
            <button
              onClick={() => changeMode("auto")}
              aria-pressed={mode === "auto"}
              className={mode === "auto" ? "on" : ""}
              title="AI edits apply automatically"
            >
              ⚡ Auto
            </button>
            <button
              onClick={() => changeMode("review")}
              aria-pressed={mode === "review"}
              className={mode === "review" ? "on" : ""}
              title="Approve each change before it's applied"
            >
              ✓ Review
            </button>
          </div>
          <button className="btn btn-sm" onClick={tailor} disabled={busy}>
            {tailoring
              ? "Tailoring…"
              : resume
                ? "✨ Regenerate"
                : "✨ Tailor for this role"}
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
        Click any line to edit it. Hover a bullet for one-tap AI rewrites. Every
        edit stays grounded in your <em>real</em> experience — never invented.
      </p>

      {/* Live ATS keyword panel + fit score */}
      {coverage && (coverage.req.length > 0 || coverage.nice.length > 0) && (
        <div className="ats-panel">
          <div className={`ats-score s-${scoreBand(coverage.score)}`}>
            <div className="ats-score-num">{coverage.score}</div>
            <div className="ats-score-cap">job fit</div>
          </div>
          <div className="ats-keys">
            <div className="ats-keys-head">
              Role keywords · {coverage.reqHitCount}/{coverage.req.length} required
              {coverage.nice.length > 0 &&
                ` · ${coverage.niceHitCount}/${coverage.nice.length} nice-to-have`}
            </div>
            <div className="ats-chips">
              {coverage.req.map((k) => (
                <span
                  key={`r-${k}`}
                  className={`ats-chip ${coverage.reqHit.has(k.toLowerCase()) ? "hit" : "miss"}`}
                  title={
                    coverage.reqHit.has(k.toLowerCase())
                      ? "Present in your resume"
                      : "Missing — weave it in where it truthfully applies"
                  }
                >
                  {coverage.reqHit.has(k.toLowerCase()) ? "✓ " : "+ "}
                  {k}
                </span>
              ))}
              {coverage.nice.map((k) => (
                <span
                  key={`n-${k}`}
                  className={`ats-chip nice ${coverage.niceHit.has(k.toLowerCase()) ? "hit" : "miss"}`}
                  title="Nice-to-have"
                >
                  {coverage.niceHit.has(k.toLowerCase()) ? "✓ " : "+ "}
                  {k}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Review panel */}
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
              <button className="btn btn-sm" onClick={() => setAccepted(new Set())}>
                Select none
              </button>
              <button className="btn btn-sm btn-primary" onClick={applyReviewed}>
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
                  <div className="faint" style={{ fontSize: 11, marginBottom: 4 }}>
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
                        textDecoration: h.kind === "del" ? "line-through" : "none",
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

      {/* Working area */}
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
                {v === "edit" ? "Raw" : v === "split" ? "Split" : "Interactive"}
              </button>
            ))}
          </div>
          <label className="tone-select" title="Voice used for AI rewrites">
            <span>Tone</span>
            <select value={tone} onChange={(e) => changeTone(e.target.value as Tone)}>
              {TONES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={`resume-body mode-${view}`}>
          {view !== "preview" && (
            <textarea
              ref={textarea}
              className="resume-input"
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              onBlur={(e) => onSave(e.target.value)}
              placeholder="Tailor a resume above, or start writing. Use ## for sections, ### for roles, and - for bullets…"
              spellCheck
            />
          )}
          {view !== "edit" && (
            <div className="resume-preview-wrap">
              {hasContent ? (
                <InteractivePreview
                  md={resume}
                  onEditLine={editLine}
                  onRewrite={rewriteLine}
                />
              ) : (
                <div className="resume-page resume-empty">
                  <p className="muted" style={{ textAlign: "center", marginTop: 60 }}>
                    Your resume preview will appear here.
                    <br />
                    Tailor for the role, or start typing.
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
          <button key={q} className="btn btn-sm" disabled={busy} onClick={() => send(q)}>
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
            const proposed = m.role === "assistant" ? extractResume(m.content) : null;
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

function scoreBand(n: number): "low" | "mid" | "high" {
  if (n >= 72) return "high";
  if (n >= 50) return "mid";
  return "low";
}

// ---------------------------------------------------------------------------
// The interactive resume "page": every line is click-to-edit, and bullets /
// paragraphs / entries expose one-tap AI rewrites on hover. Each line maps to an
// exact source line so edits splice straight back into the markdown.
// ---------------------------------------------------------------------------
function InteractivePreview({
  md,
  onEditLine,
  onRewrite,
}: {
  md: string;
  onEditLine: (line: ResumeLine, newContent: string) => void;
  onRewrite: (line: ResumeLine, action: Action) => Promise<void>;
}) {
  const lines = useMemo(() => parseResumeLines(md), [md]);

  // Group consecutive bullets into <ul>; render everything else on its own.
  const groups: { type: "ul" | "single"; items: ResumeLine[] }[] = [];
  for (const ln of lines) {
    if (ln.kind === "blank" || ln.kind === "hr") {
      groups.push({ type: "single", items: [ln] });
    } else if (ln.kind === "bullet") {
      const last = groups[groups.length - 1];
      if (last && last.type === "ul") last.items.push(ln);
      else groups.push({ type: "ul", items: [ln] });
    } else {
      groups.push({ type: "single", items: [ln] });
    }
  }

  return (
    <div className="resume-page">
      {groups.map((g, gi) => {
        if (g.type === "ul") {
          return (
            <ul key={gi}>
              {g.items.map((ln) => (
                <LineNode
                  key={ln.index}
                  line={ln}
                  as="li"
                  onEditLine={onEditLine}
                  onRewrite={onRewrite}
                />
              ))}
            </ul>
          );
        }
        const ln = g.items[0];
        if (ln.kind === "blank") return null;
        if (ln.kind === "hr") return <hr key={ln.index} />;
        return (
          <LineNode
            key={ln.index}
            line={ln}
            as={ln.kind as "h1" | "h2" | "h3" | "h4" | "p"}
            onEditLine={onEditLine}
            onRewrite={onRewrite}
          />
        );
      })}
    </div>
  );
}

function LineNode({
  line,
  as,
  onEditLine,
  onRewrite,
}: {
  line: ResumeLine;
  as: "h1" | "h2" | "h3" | "h4" | "p" | "li";
  onEditLine: (line: ResumeLine, newContent: string) => void;
  onRewrite: (line: ResumeLine, action: Action) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(line.content);
  const [busyAction, setBusyAction] = useState<Action | null>(null);

  // AI rewrites are offered on bullets, entries, and paragraphs (not the name
  // or section headers, which are structural).
  const canRewrite = as === "li" || as === "p" || as === "h3" || as === "h4";
  const Tag = as as ElementType;

  // Two-column entry line: "Left | Right" (company/location, title/dates,
  // project/tech) renders left-aligned + right-aligned like Jake's template.
  // Only a SINGLE " | " qualifies — the multi-pipe contact line stays centered.
  const twoCol =
    (as === "h3" || as === "h4" || as === "p") &&
    line.content.split(" | ").length === 2;
  let leftHtml = "";
  let rightHtml = "";
  if (twoCol) {
    const bar = line.content.lastIndexOf(" | ");
    leftHtml = renderInline(line.content.slice(0, bar));
    rightHtml = renderInline(line.content.slice(bar + 3));
  }

  function startEdit() {
    setDraft(line.content);
    setEditing(true);
  }
  function commitEdit() {
    setEditing(false);
    onEditLine(line, draft.trim());
  }

  async function runAction(action: Action) {
    setBusyAction(action);
    try {
      await onRewrite(line, action);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <Tag className={`rline${busyAction ? " rline-busy" : ""}`}>
      {editing ? (
        <textarea
          className="rline-edit"
          autoFocus
          rows={Math.max(1, Math.ceil(draft.length / 60))}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitEdit();
            } else if (e.key === "Escape") {
              setEditing(false);
              setDraft(line.content);
            }
          }}
        />
      ) : twoCol ? (
        <span className="rline-text rl-two" title="Click to edit" onClick={startEdit}>
          <span className="rl-left" dangerouslySetInnerHTML={{ __html: leftHtml }} />
          <span className="rl-right" dangerouslySetInnerHTML={{ __html: rightHtml }} />
        </span>
      ) : (
        <span
          className="rline-text"
          title="Click to edit"
          onClick={startEdit}
          dangerouslySetInnerHTML={{ __html: line.html || "&nbsp;" }}
        />
      )}

      {canRewrite && !editing && (
        <span className="rline-tools" contentEditable={false}>
          {ACTIONS.map((a) => (
            <button
              key={a.id}
              title={a.title}
              disabled={busyAction !== null}
              onClick={(e) => {
                e.stopPropagation();
                runAction(a.id);
              }}
            >
              {busyAction === a.id ? "…" : a.label}
            </button>
          ))}
        </span>
      )}
    </Tag>
  );
}
