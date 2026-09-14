"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Job } from "@/lib/types";
import { ConfidenceBadge, scoreColor } from "@/components/ui";

type Filter = "matched" | "all" | "dismissed";

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<Filter>("matched");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  async function load() {
    const j = await fetch("/api/jobs").then((r) => r.json());
    setJobs(j);
  }
  useEffect(() => {
    load();
  }, []);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function importJob(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !url.trim()) return;
    setBusy(true);
    const res = await fetch("/api/jobs/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, url: url || undefined }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.jobs) {
      setText("");
      setUrl("");
      setShowImport(false);
      flash(
        `Imported and scored ${data.jobs.length} posting${
          data.jobs.length === 1 ? "" : "s"
        }.`,
      );
      load();
    } else {
      flash(data.error ?? "Import failed — try pasting the description text.");
    }
  }

  async function fetchLive() {
    setFetching(true);
    flash("Pulling live openings from company job boards…");
    const res = await fetch("/api/jobs/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const s = await res.json();
    setFetching(false);
    if (typeof s.added === "number") {
      flash(
        `Fetched ${s.found} relevant roles from ${s.companiesReturned} companies · added ${s.added} new` +
          (s.skippedDuplicates
            ? `, skipped ${s.skippedDuplicates} already seen`
            : ""),
      );
      load();
    } else {
      flash("Live fetch failed — try again");
    }
  }

  async function dismiss(id: string, dismissed: boolean) {
    await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismissed }),
    });
    load();
  }

  const filtered = jobs.filter((j) => {
    if (filter === "dismissed") return j.dismissed;
    if (j.dismissed) return false;
    if (filter === "matched")
      return j.match?.recommended && j.match?.eligible;
    return true;
  });

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1 className="page-title">Jobs</h1>
          <p className="page-sub">
            Paste a posting and the assistant parses, scores, and ranks it.
          </p>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={fetchLive} disabled={fetching}>
            {fetching ? "Fetching…" : "⟳ Fetch live jobs"}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowImport((s) => !s)}
          >
            {showImport ? "Close" : "+ Import posting"}
          </button>
        </div>
      </div>

      {showImport && (
        <div className="card">
          <form onSubmit={importJob}>
            <div className="field">
              <label>
                Job posting URL — paste one and we&apos;ll fetch it, or leave
                blank and paste the text below
              </label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://boards.greenhouse.io/acme/jobs/123"
              />
            </div>
            <div className="field">
              <label>
                Job description (optional if a URL is given; paste several at
                once separated by a line of ---)
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"Software Engineer Intern at Acme\nLocation: Remote\nRequirements:\n- Python, React..."}
                style={{ minHeight: 160 }}
              />
            </div>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Scoring…" : "Import & score"}
            </button>
          </form>
        </div>
      )}

      <div className="tabs">
        <button
          className={`tab ${filter === "matched" ? "active" : ""}`}
          onClick={() => setFilter("matched")}
        >
          Matched
        </button>
        <button
          className={`tab ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All ({jobs.filter((j) => !j.dismissed).length})
        </button>
        <button
          className={`tab ${filter === "dismissed" ? "active" : ""}`}
          onClick={() => setFilter("dismissed")}
        >
          Dismissed ({jobs.filter((j) => j.dismissed).length})
        </button>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty">
            {filter === "matched"
              ? "No matched jobs yet. Import a posting to see it scored here."
              : "Nothing here."}
          </div>
        ) : (
          filtered.map((j) => (
            <JobRow key={j.id} j={j} onDismiss={dismiss} />
          ))
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function JobRow({
  j,
  onDismiss,
}: {
  j: Job;
  onDismiss: (id: string, d: boolean) => void;
}) {
  const m = j.match;
  return (
    <div className="list-item">
      <div style={{ minWidth: 0 }}>
        <div className="li-title">
          <Link href={`/jobs/${j.id}`}>
            {j.title} · {j.company}
          </Link>
        </div>
        <div className="li-meta">
          {j.location ?? "Location N/A"} · {j.seniority}
          {j.salaryText ? ` · ${j.salaryText}` : ""}
        </div>
        {m && (
          <>
            <div style={{ marginTop: 6 }} className="row">
              <ConfidenceBadge c={m.confidence} />
              {!m.eligible && (
                <span className="badge low">Not eligible</span>
              )}
              {m.recommended && m.eligible && (
                <span className="badge primary">Recommended</span>
              )}
            </div>
            {m.blockers.length > 0 && (
              <div className="li-meta" style={{ color: "var(--red)" }}>
                {m.blockers.join(" · ")}
              </div>
            )}
            <div className="chips">
              {m.matchedSkills.slice(0, 6).map((s) => (
                <span key={s} className="chip match">
                  {s}
                </span>
              ))}
              {m.missingSkills.slice(0, 4).map((s) => (
                <span key={s} className="chip miss">
                  {s}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="li-right">
        {m && (
          <div className="score" style={{ color: scoreColor(m.score) }}>
            {m.score}
          </div>
        )}
        <div className="btn-row">
          {j.dismissed ? (
            <button className="btn btn-sm" onClick={() => onDismiss(j.id, false)}>
              Restore
            </button>
          ) : (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => onDismiss(j.id, true)}
            >
              Dismiss
            </button>
          )}
          <Link className="btn btn-sm btn-primary" href={`/jobs/${j.id}`}>
            Open
          </Link>
        </div>
      </div>
    </div>
  );
}
