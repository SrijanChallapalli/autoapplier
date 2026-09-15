"use client";

import { useRef, useState } from "react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const QUICK = [
  "Tailor my resume to this role",
  "Make my bullets stronger and more quantified",
  "What keywords am I missing for ATS?",
  "Rewrite my summary for this job",
];

// Pull a fenced ```resume / ```markdown block out of an assistant reply.
function extractResume(text: string): string | null {
  const m = text.match(/```(?:resume|markdown|md)?\s*\n([\s\S]*?)```/i);
  return m ? m[1].trim() : null;
}

export function ResumeChat({
  appId,
  onApplyResume,
}: {
  appId: string;
  onApplyResume: (text: string) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setError(null);
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`/api/applications/${appId}/resume-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
        setTimeout(
          () => scroller.current?.scrollTo({ top: 1e9, behavior: "smooth" }),
          50,
        );
      } else {
        setError(data.error ?? "Chat failed");
      }
    } catch {
      setError("Chat failed — try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {QUICK.map((q) => (
          <button
            key={q}
            className="btn btn-sm"
            disabled={sending}
            onClick={() => send(q)}
          >
            {q}
          </button>
        ))}
      </div>

      {messages.length > 0 && (
        <div
          ref={scroller}
          style={{
            maxHeight: 360,
            overflowY: "auto",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {messages.map((m, i) => {
            const resume = m.role === "assistant" ? extractResume(m.content) : null;
            const prose = resume
              ? m.content.replace(/```[\s\S]*?```/g, "").trim()
              : m.content;
            return (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                }}
              >
                <div
                  style={{
                    background:
                      m.role === "user" ? "var(--primary)" : "var(--surface-2)",
                    color: m.role === "user" ? "#fff" : "var(--text)",
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontSize: 14,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {prose || (resume ? "Here's an updated resume:" : "")}
                </div>
                {resume && (
                  <div style={{ marginTop: 6 }}>
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        fontSize: 12,
                        background: "var(--surface-2)",
                        padding: 10,
                        borderRadius: 8,
                        maxHeight: 200,
                        overflow: "auto",
                      }}
                    >
                      {resume}
                    </pre>
                    <button
                      className="btn btn-sm btn-primary"
                      style={{ marginTop: 6 }}
                      onClick={() => onApplyResume(resume)}
                    >
                      ✓ Apply this resume
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {sending && <div className="muted">Thinking…</div>}
        </div>
      )}

      <div className="row" style={{ gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send(input);
          }}
          placeholder="Ask for edits, e.g. 'emphasize my ML projects'…"
          disabled={sending}
        />
        <button
          className="btn btn-primary"
          disabled={sending || !input.trim()}
          onClick={() => send(input)}
        >
          Send
        </button>
      </div>
      {error && (
        <p className="muted" style={{ color: "var(--amber)", marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}
