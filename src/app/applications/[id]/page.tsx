"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type {
  Application,
  ApplicationStatus,
  InterviewStage,
} from "@/lib/types";
import { StatusBadge, ConfidenceBadge, fmtDate } from "@/components/ui";

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
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/applications/${id}`)
      .then((r) => r.json())
      .then(setApp);
  }, [id]);

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
        <div className="section-label" style={{ marginTop: 0 }}>
          Pre-submission summary
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
                {st.date ? fmtDate(st.date) : "No date"} ·{" "}
                {st.outcome ?? "pending"}
              </div>
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
  question,
  onAnswer,
}: {
  question: string;
  onAnswer: (answer: string) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <div className="field">
      <label>{question}</label>
      <div className="row">
        <textarea
          value={val}
          onChange={(e) => setVal(e.target.value)}
          style={{ minHeight: 60 }}
        />
      </div>
      <button
        className="btn btn-sm btn-primary"
        style={{ marginTop: 8 }}
        disabled={!val.trim()}
        onClick={() => onAnswer(val.trim())}
      >
        Save answer
      </button>
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
