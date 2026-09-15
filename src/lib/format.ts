// Small formatting helpers usable on both server and client.

export function fmtDateISO(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD, locale-stable
}

// Whole calendar days from `now` (default: today) to `iso`. Negative = past.
export function daysUntil(iso?: string, now: Date = new Date()): number | undefined {
  if (!iso) return undefined;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return undefined;
  const day = 86_400_000;
  const startOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((startOf(target) - startOf(now)) / day);
}

// A short human hint for a date: "today", "tomorrow", "in 3 days", "2 days ago".
export function relativeDay(iso?: string, now: Date = new Date()): string | undefined {
  const d = daysUntil(iso, now);
  if (d === undefined) return undefined;
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}
