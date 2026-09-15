"use client";

import { useEffect, useState } from "react";
import type { Ats, CompanyBoard, Settings } from "@/lib/types";
import { AI_KEY_LS, AI_MODEL_LS } from "@/components/AiKeyBridge";

interface AiStatus {
  enabled: boolean;
  model: string | null;
  local: boolean;
  endpoint: string | null;
}

const DEFAULT_MODEL = "anthropic/claude-sonnet-5";

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
  const [keyInput, setKeyInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [hasKey, setHasKey] = useState(false);

  function refreshStatus() {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setAi(d.ai));
  }

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setS);
    refreshStatus();
    try {
      setHasKey(Boolean(localStorage.getItem(AI_KEY_LS)));
      setModelInput(localStorage.getItem(AI_MODEL_LS) ?? "");
    } catch {
      // localStorage may be unavailable (private mode); ignore
    }
  }, []);

  function saveKey() {
    try {
      const key = keyInput.trim();
      if (key) localStorage.setItem(AI_KEY_LS, key);
      const model = modelInput.trim();
      if (model) localStorage.setItem(AI_MODEL_LS, model);
      else localStorage.removeItem(AI_MODEL_LS);
      setHasKey(Boolean(key) || Boolean(localStorage.getItem(AI_KEY_LS)));
      setKeyInput("");
      flash("AI key saved in this browser");
      // Re-check status through the fetch bridge (which now sends the key).
      setTimeout(refreshStatus, 50);
    } catch {
      flash("Couldn't save the key in this browser");
    }
  }

  function clearKey() {
    try {
      localStorage.removeItem(AI_KEY_LS);
      localStorage.removeItem(AI_MODEL_LS);
    } catch {
      // ignore
    }
    setHasKey(false);
    setKeyInput("");
    setModelInput("");
    flash("AI key removed from this browser");
    setTimeout(refreshStatus, 50);
  }

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
            <strong>{ai.model}</strong>
            {ai.local && ai.endpoint ? (
              <>
                {" "}
                on your local endpoint <code>{ai.endpoint}</code>
              </>
            ) : null}{" "}
            for resume tailoring, the resume editor chat, cover letters, and
            answer drafting.
          </p>
        ) : (
          <p style={{ margin: 0 }} className="muted">
            <span className="badge neutral">Off</span> Running the deterministic
            engine. Point <code>AI_BASE_URL</code> at a local model, or add your
            AI Gateway key below.
          </p>
        )}

        {/* Key entry is only relevant when NOT using a keyless local endpoint. */}
        <div style={{ marginTop: 14 }} hidden={Boolean(ai?.local)}>
          <div className="field">
            <label>
              Your AI Gateway key{" "}
              {hasKey && (
                <span className="faint">· a key is saved in this browser</span>
              )}
            </label>
            <input
              type="password"
              value={keyInput}
              placeholder={hasKey ? "•••••••• (saved — enter a new key to replace)" : "vck_… or sk-…"}
              onChange={(e) => setKeyInput(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Model (optional)</label>
            <input
              value={modelInput}
              placeholder={DEFAULT_MODEL}
              onChange={(e) => setModelInput(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button
              className="btn btn-primary"
              disabled={!keyInput.trim() && !hasKey}
              onClick={saveKey}
            >
              Save key
            </button>
            {hasKey && (
              <button className="btn" onClick={clearKey}>
                Remove key
              </button>
            )}
          </div>
          <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 13 }}>
            Your key is stored only in this browser and sent with your own
            requests — never saved on the server. Get one from the{" "}
            <a
              href="https://vercel.com/docs/ai-gateway"
              target="_blank"
              rel="noopener noreferrer"
            >
              Vercel AI Gateway
            </a>
            . A server-side <code>AI_GATEWAY_API_KEY</code> still works as a
            fallback for local dev.
          </p>
        </div>
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
