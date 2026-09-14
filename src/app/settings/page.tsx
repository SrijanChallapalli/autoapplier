"use client";

import { useEffect, useState } from "react";
import type { Ats, CompanyBoard, Settings } from "@/lib/types";

interface AiStatus {
  enabled: boolean;
  model: string | null;
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [newCo, setNewCo] = useState<CompanyBoard>({
    name: "",
    ats: "greenhouse",
    token: "",
  });

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setS);
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setAi(d.ai));
  }, []);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  }

  async function save(next: Settings) {
    setBusy(true);
    const saved = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).then((r) => r.json());
    setS(saved);
    setBusy(false);
    flash("Settings saved");
  }

  if (!s) return <p className="muted">Loading…</p>;

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">
        Control where live jobs come from and how they&apos;re filtered.
      </p>

      {/* AI status */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          AI assistance
        </div>
        {ai?.enabled ? (
          <p style={{ margin: 0 }}>
            <span className="badge high">On</span> Using{" "}
            <strong>{ai.model}</strong> for match narratives and answer drafting.
          </p>
        ) : (
          <p style={{ margin: 0 }} className="muted">
            <span className="badge neutral">Off</span> Running the deterministic
            engine. Add <code>AI_GATEWAY_API_KEY</code> to{" "}
            <code>.env.local</code> and restart to enable LLM features.
          </p>
        )}
      </div>

      {/* Fetch filters */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Live fetch filters
        </div>
        <div className="checkbox-row">
          <input
            type="checkbox"
            id="internOnly"
            checked={s.internOnly}
            onChange={(e) => save({ ...s, internOnly: e.target.checked })}
          />
          <label htmlFor="internOnly" style={{ margin: 0 }}>
            Only pull internship / early-career roles
          </label>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Extra keywords (optional, comma separated)</label>
          <input
            defaultValue={s.fetchKeywords.join(", ")}
            placeholder="e.g. machine learning, backend, remote"
            onBlur={(e) =>
              save({
                ...s,
                fetchKeywords: e.target.value
                  .split(",")
                  .map((k) => k.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      </div>

      {/* Company boards */}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Company job boards ({s.companies.length})
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Add any company by its board <em>token</em> — the slug in its careers
          URL (e.g. <code>boards.greenhouse.io/&lt;token&gt;</code>,{" "}
          <code>jobs.ashbyhq.com/&lt;token&gt;</code>,{" "}
          <code>jobs.lever.co/&lt;token&gt;</code>).
        </p>

        <div
          className="row"
          style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}
        >
          <input
            placeholder="Company name"
            value={newCo.name}
            onChange={(e) => setNewCo({ ...newCo, name: e.target.value })}
            style={{ flex: "2 1 160px" }}
          />
          <select
            value={newCo.ats}
            onChange={(e) =>
              setNewCo({ ...newCo, ats: e.target.value as Ats })
            }
            style={{ flex: "1 1 120px" }}
          >
            <option value="greenhouse">Greenhouse</option>
            <option value="ashby">Ashby</option>
            <option value="lever">Lever</option>
          </select>
          <input
            placeholder="token"
            value={newCo.token}
            onChange={(e) => setNewCo({ ...newCo, token: e.target.value })}
            style={{ flex: "1 1 120px" }}
          />
          <button
            className="btn btn-primary"
            disabled={busy || !newCo.name.trim() || !newCo.token.trim()}
            onClick={() => {
              save({ ...s, companies: [...s.companies, newCo] });
              setNewCo({ name: "", ats: "greenhouse", token: "" });
            }}
          >
            Add
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {s.companies.map((c, i) => (
            <span
              key={`${c.ats}-${c.token}-${i}`}
              className="chip"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 8px",
              }}
            >
              {c.name}
              <span className="faint">· {c.ats}</span>
              <button
                aria-label={`Remove ${c.name}`}
                onClick={() =>
                  save({
                    ...s,
                    companies: s.companies.filter((_, j) => j !== i),
                  })
                }
                style={{
                  border: "none",
                  background: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: "var(--red)",
                  fontWeight: 700,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
