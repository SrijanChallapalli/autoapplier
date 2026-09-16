"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Insights } from "@/lib/insights";
import { relativeDay } from "@/lib/format";

export default function InsightsPage() {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/insights")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Crunching your pipeline…</p>;
  if (!data) return <p className="muted">Couldn&apos;t load insights.</p>;

  const applied = data.funnel.find((f) => f.key === "applied")?.count ?? 0;

  return (
    <>
      <h1 className="page-title">Insights</h1>
      <p className="page-sub">
        The shape of your search — how applications convert, what to learn next,
        and what needs you this week.
      </p>

      <div className="stats">
        <RateStat label="Response rate" value={data.responseRate} help="of applications" />
        <RateStat label="Interview rate" value={data.interviewRate} help="of applications" />
        <RateStat label="Offer rate" value={data.offerRate} help="of applications" />
      </div>

      {/* --- Funnel --- */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Application funnel
        </div>
        {data.totalPrepared === 0 ? (
          <p className="muted">
            No applications yet.{" "}
            <Link href="/jobs">Prepare one</Link> from a matched job to start
            tracking.
          </p>
        ) : (
          <Funnel funnel={data.funnel} />
        )}
        {data.totalPrepared > 0 && applied === 0 && (
          <p className="faint" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
            Mark applications as submitted (with a date applied) as you send them
            — conversion rates fill in from there.
          </p>
        )}
      </div>

      {/* --- Follow-ups & interviews --- */}
      {(data.followUps.length > 0 || data.upcomingInterviews.length > 0) && (
        <div className="card">
          <div className="section-label" style={{ marginTop: 0 }}>
            This week
          </div>
          {data.followUps.map((f) => (
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
          {data.upcomingInterviews.map((s, i) => (
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

      {/* --- Skill gaps --- */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Skills to close the gap
        </div>
        {data.skillGaps.length === 0 ? (
          <p className="muted">
            No skill gaps on your matched jobs — your profile covers what they
            ask for.
          </p>
        ) : (
          <>
            <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>
              Required skills on jobs worth pursuing that your profile
              doesn&apos;t cover yet — ranked by how often they come up.
            </p>
            <div>
              {data.skillGaps.map((g) => (
                <div key={g.skill} className="gap-row">
                  <span className="gap-skill">{g.skill}</span>
                  <div className="bar">
                    <div
                      className="bar-fill amber"
                      style={{
                        width: `${(g.jobCount / data.skillGaps[0].jobCount) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="gap-co">
                    {g.jobCount} job{g.jobCount === 1 ? "" : "s"} · {g.companies.join(", ")}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* --- Activity --- */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Activity — applications prepared per week
        </div>
        <Activity activity={data.activity} />
      </div>

      {/* --- Top companies --- */}
      {data.topCompanies.length > 0 && (
        <div className="card">
          <div className="section-label" style={{ marginTop: 0 }}>
            Most-applied companies
          </div>
          {data.topCompanies.map((c) => (
            <div key={c.company} className="list-item">
              <div className="li-title">{c.company}</div>
              <span className="badge neutral">
                {c.count} application{c.count === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function RateStat({
  label,
  value,
  help,
}: {
  label: string;
  value: number | null;
  help: string;
}) {
  return (
    <div className="stat">
      <div className="stat-num">
        {value === null ? "—" : `${Math.round(value * 100)}%`}
      </div>
      <div className="stat-label">
        {label}
        <span className="faint"> · {help}</span>
      </div>
    </div>
  );
}

function Funnel({ funnel }: { funnel: Insights["funnel"] }) {
  const max = Math.max(1, funnel[0].count);
  return (
    <div className="funnel">
      {funnel.map((s) => (
        <div key={s.key} className="funnel-row">
          <span className="fr-label">{s.label}</span>
          <div className="bar">
            <div
              className="bar-fill"
              style={{ width: `${(s.count / max) * 100}%` }}
            />
          </div>
          <span className="fr-count">{s.count}</span>
        </div>
      ))}
    </div>
  );
}

function Activity({ activity }: { activity: Insights["activity"] }) {
  const max = Math.max(1, ...activity.map((w) => w.count));
  return (
    <div className="mini-bars">
      {activity.map((w) => (
        <div key={w.weekStart} className="mini-bar" title={`Week of ${w.label}: ${w.count}`}>
          <span className="mb-count">{w.count || ""}</span>
          <div
            className={`mb-fill ${w.count === 0 ? "zero" : ""}`}
            style={{ height: `${(w.count / max) * 100}%` }}
          />
          <span className="mb-label">{w.label}</span>
        </div>
      ))}
    </div>
  );
}

