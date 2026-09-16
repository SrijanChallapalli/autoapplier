"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Application, ApplicationStatus } from "@/lib/types";
import { StatusBadge, ConfidenceBadge, fmtDate, ErrorState } from "@/components/ui";
import { relativeDay } from "@/lib/format";
import { applicationsToCsv } from "@/lib/exportCsv";
import { getJson } from "@/lib/http";

const GROUPS: { key: string; label: string; statuses: ApplicationStatus[] }[] = [
  {
    key: "active",
    label: "In progress",
    statuses: ["draft", "ready", "needs_review", "needs_input"],
  },
  {
    key: "submitted",
    label: "Submitted & interviewing",
    statuses: ["submitted", "screening", "interviewing", "offer"],
  },
  { key: "closed", label: "Closed", statuses: ["rejected", "withdrawn"] },
];

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [tab, setTab] = useState("active");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setApps(await getJson<Application[]>("/api/applications"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load applications.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const group = GROUPS.find((g) => g.key === tab)!;
  const q = query.trim().toLowerCase();
  const rows = apps
    .filter((a) => group.statuses.includes(a.status))
    .filter(
      (a) =>
        !q ||
        `${a.title} ${a.company} ${a.location ?? ""}`.toLowerCase().includes(q),
    );

  function exportCsv() {
    const csv = applicationsToCsv(apps);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `autoapplier-applications-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="row-between">
        <div>
          <h1 className="page-title">Applications</h1>
          <p className="page-sub">
            Every application the assistant has prepared — tracked end to end.
          </p>
        </div>
        {apps.length > 0 && (
          <button className="btn btn-sm" onClick={exportCsv}>
            ↓ Export CSV
          </button>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      <div className="tabs" role="tablist" aria-label="Application status">
        {GROUPS.map((g) => {
          const count = apps.filter((a) =>
            g.statuses.includes(a.status),
          ).length;
          return (
            <button
              key={g.key}
              role="tab"
              aria-selected={tab === g.key}
              className={`tab ${tab === g.key ? "active" : ""}`}
              onClick={() => setTab(g.key)}
            >
              {g.label} ({count})
            </button>
          );
        })}
      </div>

      {apps.length > 0 && (
        <div className="field" style={{ marginBottom: 14 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, company, or location…"
            aria-label="Search applications"
          />
        </div>
      )}

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty">
            {q ? (
              <>No applications match “{query.trim()}”.</>
            ) : (
              <>
                Nothing here yet.{" "}
                <Link href="/jobs">Prepare an application</Link> from a matched
                job.
              </>
            )}
          </div>
        ) : (
          rows.map((a) => (
            <div key={a.id} className="list-item">
              <div>
                <div className="li-title">
                  <Link href={`/applications/${a.id}`}>
                    {a.title} · {a.company}
                  </Link>
                </div>
                <div className="li-meta">
                  {a.location ?? "Location N/A"}
                  {a.resumeLabel ? ` · ${a.resumeLabel}` : ""}
                  {a.dateApplied
                    ? ` · Applied ${fmtDate(a.dateApplied)}`
                    : ""}
                  {a.followUpDate
                    ? ` · Follow up ${fmtDate(a.followUpDate)} (${relativeDay(
                        a.followUpDate,
                      )})`
                    : ""}
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  <ConfidenceBadge c={a.confidence} />
                </div>
              </div>
              <div className="li-right">
                <StatusBadge s={a.status} />
                <Link className="btn btn-sm" href={`/applications/${a.id}`}>
                  Review →
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
