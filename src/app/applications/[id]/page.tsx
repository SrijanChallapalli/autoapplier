"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type {
  Application,
  ApplicationStatus,
  InterviewStage,
  Profile,
} from "@/lib/types";
import { StatusBadge, ConfidenceBadge, fmtDate } from "@/components/ui";
import { buildPacket } from "@/lib/packet";
import { buildResumeMarkdown } from "@/lib/resumeBuild";
import type { NetworkLink } from "@/lib/networking";
import { FlagsPanel } from "@/components/FlagsPanel";
import { ResumeEditor } from "@/components/ResumeEditor";

const STATUS_OPTIONS: ApplicationStatus[] = [
  "draft",
  "ready",
  "needs_review",
  "needs_input",
  "submitted",
  "screening",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
];

export default function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [app, setApp] = useState<Application | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/applications/${id}`)
      .then((r) => r.json())
      .then(setApp);
  }, [id]);

  // The resume editor falls back to a resume built from the profile when this
  // application has no tailored resume yet — so the preview shows your real
  // resume immediately, no AI key required.
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then(setProfile)
      .catch(() => {});
  }, []);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function patch(update: Partial<Application>, msg?: string) {
    const res = await fetch(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    const saved = await res.json();
    setApp(saved);
    if (msg) flash(msg);
  }

  const [links, setLinks] = useState<NetworkLink[] | null>(null);
  const [outreach, setOutreach] = useState("");
  const [genOutreach, setGenOutreach] = useState(false);
  useEffect(() => {
    fetch(`/api/applications/${id}/networking`)
      .then((r) => r.json())
      .then((d) => setLinks(d.links ?? null))
      .catch(() => {});
  }, [id]);
  async function draftOutreach() {
    setGenOutreach(true);
    const res = await fetch(`/api/applications/${id}/networking`, {
      method: "POST",
    });
    const data = await res.json();
    setGenOutreach(false);
    if (data.message) setOutreach(data.message);
    else flash(data.error ?? "Couldn't draft outreach");
  }

  const [genLetter, setGenLetter] = useState(false);
  async function generateLetter() {
    setGenLetter(true);
    const res = await fetch(`/api/applications/${id}/cover-letter`, {
      method: "POST",
    });
    const data = await res.json();
    setGenLetter(false);
    if (data.coverLetter) {
      setApp((a) => (a ? { ...a, coverLetter: data.coverLetter } : a));
      flash("Cover letter generated");
    } else {
      flash(data.error ?? "Couldn't generate");
    }
  }

  async function copyPacket() {
    if (!app) return;
    const text = buildPacket(app);
    try {
      await navigator.clipboard.writeText(text);
      flash("Application packet copied to clipboard");
    } catch {
      // Clipboard can be blocked; fall back to a prompt-friendly window.
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(`<pre>${text.replace(/</g, "&lt;")}</pre>`);
        flash("Opened packet in a new tab");
      } else {
        flash("Copy blocked — select the answers manually");
      }
    }
  }

  if (!app) return <p className="muted">Loading…</p>;

  const unusualAnswers = app.answers.filter((a) => a.unusual);

  return (
    <>
      <Link href="/applications" className="muted">
        ← Back to applications
      </Link>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginTop: 12,
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="page-title">{app.title}</h1>
          <p className="page-sub" style={{ marginBottom: 8 }}>
            {app.company} · {app.location ?? "Location N/A"}
            {app.jobUrl && (
              <>
                {" · "}
                <a href={app.jobUrl} target="_blank" rel="noreferrer">
                  Posting ↗
                </a>
              </>
            )}
          </p>
          <div className="row">
            <StatusBadge s={app.status} />
            <ConfidenceBadge c={app.confidence} />
          </div>
        </div>
      </div>

      {/* --- Pre-submission review summary --- */}
      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div className="section-label" style={{ marginTop: 0 }}>
            Pre-submission summary
          </div>
          <button className="btn btn-sm" onClick={copyPacket}>
            ⧉ Copy packet
          </button>
        </div>
        <SummaryRow label="Company" value={app.company} />
        <SummaryRow label="Position" value={app.title} />
        <SummaryRow label="Location" value={app.location ?? "—"} />
        <SummaryRow
          label="Resume"
          value={app.resumeLabel ?? "None selected"}
        />
        <div className="section-label">Why you&apos;re a good match</div>
        <p style={{ marginTop: 0 }}>{app.matchSummary}</p>

        {app.keyRequirements.length > 0 && (
          <>
            <div className="section-label">Important requirements</div>
            <ul className="clean">
              {app.keyRequirements.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        )}

        {unusualAnswers.length > 0 && (
          <>
            <div className="section-label">Unusual answers entered</div>
            {unusualAnswers.map((a, i) => (
              <div key={i} className="flag">
                <strong>{a.question}</strong>: {a.answer}
              </div>
            ))}
          </>
        )}
      </div>

      {/* --- Open questions (low-confidence gate) --- */}
      {app.openQuestions.length > 0 && (
        <div className="card">
          <div className="section-label" style={{ marginTop: 0 }}>
            Questions the assistant needs you to answer
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            These were flagged as unusual, legal, salary, or essay questions.
            Answer them, then mark the application ready.
          </p>
          {app.openQuestions.map((q, i) => (
            <OpenQuestion
              key={i}
              appId={app.id}
              question={q}
              onAnswer={(answer) => {
                const answers = [
                  ...app.answers,
                  {
                    question: q,
                    answer,
                    source: "user" as const,
                    unusual: true,
                  },
                ];
                const remaining = app.openQuestions.filter((_, j) => j !== i);
                patch(
                  {
                    answers,
                    openQuestions: remaining,
                    status:
                      remaining.length === 0 && app.confidence !== "low"
                        ? "needs_review"
                        : app.status,
                  },
                  "Answer saved",
                );
              }}
            />
          ))}
        </div>
      )}

      {/* --- Standard answers --- */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Answers the assistant filled in ({app.answers.length})
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {app.answers.map((a, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                <td
                  style={{
                    padding: "8px 8px 8px 0",
                    color: "var(--text-muted)",
                    width: "45%",
                    verticalAlign: "top",
                  }}
                >
                  {a.question}
                  {a.unusual && (
                    <span
                      className="badge medium"
                      style={{ marginLeft: 6, fontSize: 10 }}
                    >
                      review
                    </span>
                  )}
                </td>
                <td style={{ padding: "8px 0" }}>{a.answer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- Decision / status controls --- */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Decision
        </div>
        <div className="btn-row" style={{ marginBottom: 14 }}>
          {app.status !== "submitted" && (
            <button
              className="btn btn-primary"
              onClick={() =>
                patch(
                  { status: "submitted" },
                  "Marked as submitted — logged in tracker",
                )
              }
            >
              ✓ Mark as submitted
            </button>
          )}
          {app.status === "needs_review" && (
            <button
              className="btn"
              onClick={() => patch({ status: "ready" }, "Approved")}
            >
              Approve (ready to submit)
            </button>
          )}
          <button
            className="btn btn-danger"
            onClick={() => patch({ status: "withdrawn" }, "Withdrawn")}
          >
            Withdraw
          </button>
        </div>

        <div className="grid-2">
          <div className="field">
            <label>Status</label>
            <select
              value={app.status}
              onChange={(e) =>
                patch({ status: e.target.value as ApplicationStatus })
              }
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Follow-up date</label>
            <input
              type="date"
              value={app.followUpDate?.slice(0, 10) ?? ""}
              onChange={(e) =>
                patch({
                  followUpDate: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : undefined,
                })
              }
            />
          </div>
        </div>
        <div className="field">
          <label>Date applied</label>
          <div className="muted">{fmtDate(app.dateApplied)}</div>
        </div>
      </div>

      {/* --- Recruiter & interviews --- */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Recruiter
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Name</label>
            <input
              defaultValue={app.recruiter?.name ?? ""}
              onBlur={(e) =>
                patch({
                  recruiter: { ...app.recruiter, name: e.target.value },
                })
              }
            />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              defaultValue={app.recruiter?.email ?? ""}
              onBlur={(e) =>
                patch({
                  recruiter: { ...app.recruiter, email: e.target.value },
                })
              }
            />
          </div>
        </div>

        <div className="section-label">Interview stages</div>
        {app.interviewStages.length === 0 && (
          <p className="muted" style={{ marginTop: 0 }}>
            No stages yet.
          </p>
        )}
        {app.interviewStages.map((st, i) => (
          <div key={i} className="list-item">
            <div>
              <div className="li-title">{st.name}</div>
              <div className="li-meta">
                {st.date ? fmtDate(st.date) : "No date"}
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <select
                aria-label={`Outcome for ${st.name}`}
                value={st.outcome ?? "pending"}
                style={{ width: "auto", padding: "5px 8px" }}
                onChange={(e) => {
                  const next = app.interviewStages.map((s, j) =>
                    j === i
                      ? { ...s, outcome: e.target.value as InterviewStage["outcome"] }
                      : s,
                  );
                  patch({ interviewStages: next }, "Stage updated");
                }}
              >
                <option value="pending">Pending</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
              </select>
              <button
                className="btn btn-sm btn-danger"
                aria-label={`Remove ${st.name}`}
                title="Remove stage"
                onClick={() => {
                  const next = app.interviewStages.filter((_, j) => j !== i);
                  patch({ interviewStages: next }, "Stage removed");
                }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <AddStage
          onAdd={(stage) =>
            patch(
              { interviewStages: [...app.interviewStages, stage] },
              "Stage added",
            )
          }
        />
      </div>

      {/* --- Flags & ATS --- */}
      <FlagsPanel appId={app.id} refreshKey={app.tailoredResume ?? ""} />

      {/* --- Resume editor (tailored resume + chat + PDF) --- */}
      <div className="card">
        {profile ? (
          <ResumeEditor
            appId={app.id}
            company={app.company}
            title={app.title}
            resumeLabel={app.resumeLabel}
            initialResume={
              app.tailoredResume?.trim()
                ? app.tailoredResume
                : buildResumeMarkdown(profile)
            }
            onSave={(text) => {
              setApp((a) => (a ? { ...a, tailoredResume: text } : a));
              patch({ tailoredResume: text });
            }}
            onFlash={flash}
          />
        ) : (
          <p className="muted">Loading resume…</p>
        )}
      </div>

      {/* --- Networking --- */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Find people who work here
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          One-click searches to open in your own LinkedIn — recruiters, people in
          the role, and alumni from your school. (No scraping; you stay logged
          in and in control.)
        </p>
        {links && links.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="btn"
                style={{ textAlign: "left", display: "block" }}
              >
                🔗 {l.label}
                <span
                  className="faint"
                  style={{ display: "block", fontWeight: 400, fontSize: 12 }}
                >
                  {l.desc}
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p className="muted">Loading search links…</p>
        )}

        <div className="section-label">Outreach note</div>
        <button
          className="btn btn-sm"
          onClick={draftOutreach}
          disabled={genOutreach}
        >
          {genOutreach ? "Drafting…" : "✨ Draft a connection note"}
        </button>
        {outreach && (
          <>
            <textarea
              value={outreach}
              onChange={(e) => setOutreach(e.target.value)}
              style={{ minHeight: 80, marginTop: 10 }}
            />
            <button
              className="btn btn-sm"
              style={{ marginTop: 8 }}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(outreach);
                  flash("Outreach note copied");
                } catch {
                  flash("Copy blocked — select the text manually");
                }
              }}
            >
              ⧉ Copy note
            </button>
          </>
        )}
      </div>

      {/* --- Cover letter --- */}
      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div className="section-label" style={{ marginTop: 0 }}>
            Cover letter
          </div>
          <button className="btn btn-sm" onClick={generateLetter} disabled={genLetter}>
            {genLetter
              ? "Writing…"
              : app.coverLetter
                ? "✨ Regenerate"
                : "✨ Generate with AI"}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Grounded in your real experience only. Edit freely; edits save on blur.
        </p>
        <textarea
          value={app.coverLetter ?? ""}
          onChange={(e) =>
            setApp((a) => (a ? { ...a, coverLetter: e.target.value } : a))
          }
          onBlur={(e) => patch({ coverLetter: e.target.value })}
          placeholder="Generate a draft with AI, or write your own…"
          style={{ minHeight: 160 }}
        />
      </div>

      {/* --- Notes --- */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Notes
        </div>
        <textarea
          defaultValue={app.notes ?? ""}
          onBlur={(e) => patch({ notes: e.target.value })}
          placeholder="Anything you want to remember about this application…"
        />
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", padding: "4px 0" }}>
      <div style={{ width: 130, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function OpenQuestion({
  appId,
  question,
  onAnswer,
}: {
  appId: string;
  question: string;
  onAnswer: (answer: string) => void;
}) {
  const [val, setVal] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftErr, setDraftErr] = useState<string | null>(null);

  async function draft() {
    setDrafting(true);
    setDraftErr(null);
    // Strip the "(category) " prefix the detector adds before sending.
    const clean = question.replace(/^\([^)]*\)\s*/, "");
    const res = await fetch(`/api/applications/${appId}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: clean }),
    });
    const data = await res.json();
    setDrafting(false);
    if (data.draft) setVal(data.draft);
    else setDraftErr(data.error ?? "Draft failed");
  }

  return (
    <div className="field">
      <label>{question}</label>
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        style={{ minHeight: 60 }}
        placeholder="Type your answer, or draft one with AI…"
      />
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button
          className="btn btn-sm btn-primary"
          disabled={!val.trim()}
          onClick={() => onAnswer(val.trim())}
        >
          Save answer
        </button>
        <button className="btn btn-sm" disabled={drafting} onClick={draft}>
          {drafting ? "Drafting…" : "✨ Draft with AI"}
        </button>
      </div>
      {draftErr && (
        <p className="muted" style={{ color: "var(--amber)", marginTop: 6 }}>
          {draftErr}
        </p>
      )}
    </div>
  );
}

function AddStage({ onAdd }: { onAdd: (s: InterviewStage) => void }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  return (
    <div className="grid-2" style={{ marginTop: 10, alignItems: "end" }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Stage name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Recruiter screen"
        />
      </div>
      <div className="row" style={{ alignItems: "end", gap: 8 }}>
        <div className="field" style={{ marginBottom: 0, flex: 1 }}>
          <label>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <button
          className="btn btn-sm"
          disabled={!name.trim()}
          onClick={() => {
            onAdd({
              name: name.trim(),
              date: date ? new Date(date).toISOString() : undefined,
              outcome: "pending",
            });
            setName("");
            setDate("");
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
