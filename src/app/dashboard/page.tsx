"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Application, Job } from "@/lib/types";
import type { DashboardStats } from "@/lib/service";
import type { Insights } from "@/lib/insights";
import { ConfidenceBadge, StatusBadge, scoreColor, ErrorState } from "@/components/ui";
import { relativeDay } from "@/lib/format";
import { getJson } from "@/lib/http";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, j, a, i] = await Promise.all([
        getJson<DashboardStats>("/api/dashboard"),
        getJson<Job[]>("/api/jobs"),
        getJson<Application[]>("/api/applications"),
        getJson<Insights>("/api/insights"),
      ]);
      setStats(s);
      setJobs(j);
      setApps(a);
      setInsights(i);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your pipeline.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function prepareTop() {
    setBusy(true);
    const res = await fetch("/api/jobs/prepare-top", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 12 }),
    });
    const d = await res.json();
    setBusy(false);
    setToast(
      d.prepared
        ? `Prepared ${d.prepared} application${d.prepared === 1 ? "" : "s"} — review them below`
        : "No new matches to prepare",
    );
    setTimeout(() => setToast(null), 3500);
    load();
  }

  if (loading) return <p className="muted">Loading your pipeline…</p>;
  if (error)
    return (
      <>
        <h1 className="page-title">Today&apos;s job search</h1>
        <ErrorState message={error} onRetry={load} />
      </>
    );

  const needsAttention = apps.filter(
    (a) => a.status === "needs_input" || a.status === "needs_review",
  );
  const ready = apps.filter((a) => a.status === "ready");
  const topMatches = jobs
    .filter((j) => j.match?.recommended && j.match?.eligible && !j.dismissed)
    .filter((j) => !apps.some((a) => a.jobId === j.id))
    .slice(0, 5);

  const steps = stats
    ? [
        {
          done: stats.profileComplete,
          label: "Build your profile",
          hint: "Upload your resume — we read the whole thing (never invents).",
          href: "/profile",
          cta: "Go to Profile",
        },
        {
          done: stats.totalJobs > 0,
          label: "Get some jobs",
          hint: "Fetch live openings from real ATS boards, or paste a posting.",
          href: "/jobs",
          cta: "Go to Jobs",
        },
        {
          done: stats.totalApplications > 0,
          label: "Prepare your first application",
          hint: "We auto-fill standard questions and pick your best resume.",
          href: "/jobs",
          cta: "Review matches",
        },
      ]
    : [];
  const onboarded = steps.length > 0 && steps.every((s) => s.done);

  return (
    <>
      <h1 className="page-title">Today&apos;s job search</h1>
      <p className="page-sub">
        Your assistant found, ranked, and prepared these for you. You stay in
        control of every submission.
      </p>

      {!onboarded && steps.length > 0 && <Onboarding steps={steps} />}

      {stats && onboarded && <div className="headline">{stats.headline}</div>}

      {stats && (
        <div className="stats">
          <Stat n={stats.foundToday || stats.totalJobs} label="Jobs in pipeline" />
          <Stat n={stats.matched} label="Matched your profile" />
          <Stat n={stats.ready} label="Ready to submit" color="var(--green)" />
          <Stat
            n={stats.needsReview}
            label="Need approval"
            color="var(--amber)"
          />
          <Stat n={stats.needsInput} label="Need your input" color="var(--red)" />
          <Stat n={stats.submitted} label="Submitted" color="var(--primary)" />
        </div>
      )}

      {insights &&
        (insights.followUps.length > 0 ||
          insights.upcomingInterviews.length > 0) && (
          <div className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div className="section-label" style={{ marginTop: 0 }}>
                This week
              </div>
              <Link className="btn btn-sm" href="/insights">
                All insights →
              </Link>
            </div>
            {insights.followUps.map((f) => (
              <div key={f.applicationId} className="list-item">
                <div>
                  <div className="li-title">
                    <Link href={`/applications/${f.applicationId}`}>
                      {f.title} · {f.company}
                    </Link>
                  </div>
                  <div
                    className="li-meta"
                    style={{ color: f.overdue ? "var(--red)" : "var(--amber)" }}
                  >
                    Follow up {relativeDay(f.dueDate)}
                  </div>
                </div>
                <span className={`badge ${f.overdue ? "low" : "medium"}`}>
                  {f.overdue ? "Overdue" : "Due soon"}
                </span>
              </div>
            ))}
            {insights.upcomingInterviews.map((s, i) => (
              <div key={`${s.applicationId}-${i}`} className="list-item">
                <div>
                  <div className="li-title">
                    <Link href={`/applications/${s.applicationId}`}>
                      {s.stage} · {s.company}
                    </Link>
                  </div>
                  <div className="li-meta">
                    {s.title} · {relativeDay(s.date)}
                  </div>
                </div>
                <span className="badge primary">Interview</span>
              </div>
            ))}
          </div>
        )}

      {needsAttention.length > 0 && (
        <div className="card">
          <div className="section-label" style={{ marginTop: 0 }}>
            Needs your attention
          </div>
          {needsAttention.map((a) => (
            <AppRow key={a.id} a={a} />
          ))}
        </div>
      )}

      {ready.length > 0 && (
        <div className="card">
          <div className="section-label" style={{ marginTop: 0 }}>
            Ready to submit ({ready.length})
          </div>
          {ready.map((a) => (
            <AppRow key={a.id} a={a} />
          ))}
        </div>
      )}

      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div className="section-label" style={{ marginTop: 0 }}>
            Top matches to prepare
          </div>
          {topMatches.length > 0 && (
            <button
              className="btn btn-sm btn-primary"
              onClick={prepareTop}
              disabled={busy}
            >
              {busy ? "Preparing…" : `Prepare top ${Math.min(topMatches.length, 12)}`}
            </button>
          )}
        </div>
        {topMatches.length === 0 ? (
          <p className="muted">
            No new matches waiting.{" "}
            <Link href="/jobs">Import some job postings</Link> to get started.
          </p>
        ) : (
          topMatches.map((j) => <JobRow key={j.id} j={j} />)
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

interface Step {
  done: boolean;
  label: string;
  hint: string;
  href: string;
  cta: string;
}

function Onboarding({ steps }: { steps: Step[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  // The first not-yet-done step is the one to nudge.
  const activeIndex = steps.findIndex((s) => !s.done);

  return (
    <div className="card onboarding">
      <div className="row-between" style={{ marginBottom: 4 }}>
        <div className="section-label" style={{ margin: 0 }}>
          Getting started
        </div>
        <span className="li-meta" style={{ marginTop: 0 }}>
          {doneCount} of {steps.length} done
        </span>
      </div>
      <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>
        Three quick steps and your assistant starts finding and preparing
        applications for you.
      </p>
      {steps.map((s, i) => (
        <div
          key={s.label}
          className={`onboard-step ${s.done ? "done" : ""}`}
        >
          <span className="onboard-check" aria-hidden="true">
            {s.done ? "✓" : i + 1}
          </span>
          <div style={{ flex: 1 }}>
            <div className="li-title">{s.label}</div>
            <div className="li-meta">{s.hint}</div>
          </div>
          {!s.done && (
            <Link
              className={`btn btn-sm ${i === activeIndex ? "btn-primary" : ""}`}
              href={s.href}
            >
              {s.cta}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

function Stat({
  n,
  label,
  color,
}: {
  n: number;
  label: string;
  color?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-num" style={color ? { color } : undefined}>
        {n}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function AppRow({ a }: { a: Application }) {
  return (
    <div className="list-item">
      <div>
        <div className="li-title">
          <Link href={`/applications/${a.id}`}>
            {a.title} · {a.company}
          </Link>
        </div>
        <div className="li-meta">
          {a.location ?? "Location N/A"} ·{" "}
          {a.resumeLabel ? `Resume: ${a.resumeLabel}` : "No resume selected"}
        </div>
        {a.openQuestions.length > 0 && (
          <div className="li-meta" style={{ color: "var(--amber)" }}>
            {a.openQuestions.length} question
            {a.openQuestions.length === 1 ? "" : "s"} for you
          </div>
        )}
      </div>
      <div className="li-right">
        <StatusBadge s={a.status} />
        <Link className="btn btn-sm" href={`/applications/${a.id}`}>
          Review →
        </Link>
      </div>
    </div>
  );
}

function JobRow({ j }: { j: Job }) {
  const m = j.match!;
  return (
    <div className="list-item">
      <div>
        <div className="li-title">
          <Link href={`/jobs/${j.id}`}>
            {j.title} · {j.company}
          </Link>
        </div>
        <div className="li-meta">
          {j.location ?? "Location N/A"} · {j.seniority}
        </div>
        <div style={{ marginTop: 6 }}>
          <ConfidenceBadge c={m.confidence} />
        </div>
      </div>
      <div className="li-right">
        <div className="score" style={{ color: scoreColor(m.score) }}>
          {m.score}
        </div>
        <Link className="btn btn-sm btn-primary" href={`/jobs/${j.id}`}>
          Prepare →
        </Link>
      </div>
    </div>
  );
}
