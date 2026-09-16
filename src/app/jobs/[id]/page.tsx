"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Job } from "@/lib/types";
import { ConfidenceBadge, scoreColor } from "@/components/ui";

export default function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/jobs/${id}`)
      .then((r) => r.json())
      .then(setJob);
  }, [id]);

  async function prepare() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/jobs/${id}/prepare`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (data.application) {
      router.push(`/applications/${data.application.id}`);
    } else {
      setError(data.error ?? "Could not prepare application");
    }
  }

  if (!job) return <p className="muted">Loading…</p>;
  const m = job.match;

  return (
    <>
      <Link href="/jobs" className="muted">
        ← Back to jobs
      </Link>
      <h1 className="page-title" style={{ marginTop: 12 }}>
        {job.title}
      </h1>
      <p className="page-sub">
        {job.company} · {job.location ?? "Location N/A"} · {job.seniority}
        {job.url && (
          <>
            {" · "}
            <a href={job.url} target="_blank" rel="noreferrer">
              View posting ↗
            </a>
          </>
        )}
      </p>

      {m && (
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div className="row" style={{ flexWrap: "wrap" }}>
              <ConfidenceBadge c={m.confidence} />
              {m.recommended && m.eligible && (
                <span className="badge primary">Recommended</span>
              )}
              {!m.eligible && <span className="badge low">Not eligible</span>}
              {!!m.learningDelta && (
                <span
                  className={`badge ${m.learningDelta > 0 ? "high" : "medium"}`}
                  title={
                    m.learningTags?.length
                      ? `Adjusted by your past choices on: ${m.learningTags.join(", ")}`
                      : "Adjusted by your past choices"
                  }
                >
                  {m.learningDelta > 0 ? "↑" : "↓"} {m.learningDelta > 0 ? "+" : ""}
                  {m.learningDelta} learned
                </span>
              )}
            </div>
            <div
              className="score"
              style={{ color: scoreColor(m.score), fontSize: 34 }}
            >
              {m.score}
              <span style={{ fontSize: 15, color: "var(--text-faint)" }}>
                /100
              </span>
            </div>
          </div>

          {m.blockers.length > 0 && (
            <>
              <div className="section-label">Blockers</div>
              <ul className="clean">
                {m.blockers.map((b) => (
                  <li key={b} style={{ color: "var(--red)" }}>
                    {b}
                  </li>
                ))}
              </ul>
            </>
          )}

          {m.reasons.length > 0 && (
            <>
              <div className="section-label">Why it&apos;s a good match</div>
              <ul className="clean">
                {m.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          )}

          {m.concerns.length > 0 && (
            <>
              <div className="section-label">Things to review</div>
              <ul className="clean">
                {m.concerns.map((c) => (
                  <li key={c} className="muted">
                    {c}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="section-label">Skills</div>
          <div className="chips">
            {m.matchedSkills.map((s) => (
              <span key={s} className="chip match">
                ✓ {s}
              </span>
            ))}
            {m.missingSkills.map((s) => (
              <span key={s} className="chip miss">
                {s}
              </span>
            ))}
            {m.matchedSkills.length === 0 && m.missingSkills.length === 0 && (
              <span className="muted">No specific skills detected.</span>
            )}
          </div>

          <div style={{ marginTop: 20 }} className="btn-row">
            <button
              className="btn btn-primary"
              onClick={prepare}
              disabled={busy}
            >
              {busy ? "Preparing…" : "Prepare application"}
            </button>
          </div>
          {error && (
            <p style={{ color: "var(--amber)", marginTop: 10 }}>{error}</p>
          )}
        </div>
      )}

      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Job description
        </div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontFamily: "inherit",
            margin: 0,
            fontSize: 14,
          }}
        >
          {job.description}
        </pre>
      </div>
    </>
  );
}
