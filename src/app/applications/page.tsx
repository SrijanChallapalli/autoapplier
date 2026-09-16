"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Application, ApplicationStatus } from "@/lib/types";
import { StatusBadge, ConfidenceBadge, fmtDate } from "@/components/ui";
import { relativeDay } from "@/lib/format";
import { applicationsToCsv } from "@/lib/exportCsv";

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

  useEffect(() => {
    fetch("/api/applications")
      .then((r) => r.json())
      .then(setApps);
  }, []);

  const group = GROUPS.find((g) => g.key === tab)!;
  const rows = apps.filter((a) => group.statuses.includes(a.status));

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

      <div className="tabs">
        {GROUPS.map((g) => {
          const count = apps.filter((a) =>
            g.statuses.includes(a.status),
          ).length;
          return (
            <button
              key={g.key}
              className={`tab ${tab === g.key ? "active" : ""}`}
              onClick={() => setTab(g.key)}
            >
              {g.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty">
            Nothing here yet.{" "}
            <Link href="/jobs">Prepare an application</Link> from a matched job.
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
