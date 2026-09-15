"use client";

import { useEffect, useState } from "react";
import type { Flag, FlagReport } from "@/lib/flags";

const META: Record<
  Flag["level"],
  { label: string; dot: string; bg: string; heading: string }
> = {
  green: { label: "Green flag", dot: "var(--green)", bg: "var(--green-soft)", heading: "Good" },
  yellow: { label: "Yellow flag", dot: "var(--amber)", bg: "var(--amber-soft)", heading: "Needs improvement" },
  red: { label: "Red flag", dot: "var(--red)", bg: "var(--red-soft)", heading: "Needs to change" },
};

export function FlagsPanel({
  appId,
  refreshKey,
}: {
  appId: string;
  refreshKey?: string | number;
}) {
  const [report, setReport] = useState<FlagReport | null>(null);

  useEffect(() => {
    fetch(`/api/applications/${appId}/flags`)
      .then((r) => r.json())
      .then((d) => setReport(d.flags ? d : null))
      .catch(() => {});
  }, [appId, refreshKey]);

  if (!report) return null;

  const groups: Flag["level"][] = ["green", "yellow", "red"];

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div className="section-label" style={{ marginTop: 0 }}>
          Flags &amp; ATS check
        </div>
        <span
          className="badge"
          style={{
            background:
              report.atsScore >= 70
                ? "var(--green-soft)"
                : report.atsScore >= 45
                  ? "var(--amber-soft)"
                  : "var(--red-soft)",
            color:
              report.atsScore >= 70
                ? "var(--green)"
                : report.atsScore >= 45
                  ? "var(--amber)"
                  : "var(--red)",
          }}
        >
          ATS readiness {report.atsScore}/100
        </span>
      </div>

      {groups.map((level) => {
        const items = report.flags.filter((f) => f.level === level);
        if (items.length === 0) return null;
        const meta = META[level];
        return (
          <div key={level} style={{ marginTop: 12 }}>
            <div className="row" style={{ gap: 7, marginBottom: 6 }}>
              <span className="dot" style={{ background: meta.dot }} />
              <strong style={{ fontSize: 13 }}>
                {meta.heading} ({items.length})
              </strong>
            </div>
            {items.map((f, i) => (
              <div
                key={i}
                style={{
                  background: meta.bg,
                  borderRadius: 8,
                  padding: "8px 11px",
                  marginBottom: 6,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{f.title}</div>
                {f.detail && (
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                    {f.detail}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}

      <div className="section-label">How to get past ATS</div>
      <ul className="clean" style={{ fontSize: 14 }}>
        {report.atsSuggestions.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}
