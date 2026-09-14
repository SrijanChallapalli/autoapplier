import type { Confidence, ApplicationStatus } from "@/lib/types";

export function ConfidenceBadge({ c }: { c: Confidence }) {
  const label = { high: "High", medium: "Medium", low: "Low" }[c];
  return <span className={`badge ${c}`}>{label} confidence</span>;
}

const STATUS_META: Record<
  ApplicationStatus,
  { label: string; cls: string }
> = {
  draft: { label: "Draft", cls: "neutral" },
  ready: { label: "Ready to submit", cls: "high" },
  needs_review: { label: "Needs review", cls: "medium" },
  needs_input: { label: "Needs your input", cls: "low" },
  submitted: { label: "Submitted", cls: "primary" },
  screening: { label: "Screening", cls: "primary" },
  interviewing: { label: "Interviewing", cls: "primary" },
  offer: { label: "Offer", cls: "high" },
  rejected: { label: "Rejected", cls: "neutral" },
  withdrawn: { label: "Withdrawn", cls: "neutral" },
};

export function StatusBadge({ s }: { s: ApplicationStatus }) {
  const m = STATUS_META[s] ?? { label: s, cls: "neutral" };
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

export function scoreColor(score: number): string {
  if (score >= 70) return "var(--green)";
  if (score >= 50) return "var(--amber)";
  return "var(--red)";
}

export function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
