// Small presentation helpers. All money is in USD cents (gateway convention).

/** Display only: stored names, request arguments and links retain their full identity. */
export function preparedName(name: string, record: unknown): string {
  if (typeof record !== "object" || record === null || !("exampleKind" in record) || record.exampleKind !== "prepared") return name;
  const match = /^(.*?) · [0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:@prepared:(.+))?$/i.exec(name);
  if (!match) return name;
  return match[2] ? `${match[1]} → ${match[2].replace(/-/g, " ")}` : match[1]!;
}

export function quality(score: number | null | undefined): string {
  if (score == null) return "—";
  return score.toFixed(2);
}

export function qualityPct(score: number | null | undefined): string {
  if (score == null) return "—";
  return `${Math.round(score * 100)}%`;
}

/** Cents → a compact dollar/cent string, e.g. 0.069¢ or $0.42. */
export function cents(c: number | null | undefined): string {
  if (c == null) return "—";
  if (c < 1) return `${c.toFixed(3)}¢`;
  if (c < 100) return `${c.toFixed(2)}¢`;
  return `$${(c / 100).toFixed(2)}`;
}

/** Cost per 1k tokens label. */
export function costPer1k(c: number | null | undefined): string {
  return c == null ? "—" : `${cents(c)}/1k`;
}

/** A signed percentage; negative renders green (cheaper), positive red. */
export function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  const s = n > 0 ? "+" : "";
  return `${s}${n.toFixed(0)}%`;
}

export function ms(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

export function signedMs(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${ms(Math.abs(n))}`;
}

/** Split "provider:model" into a short label + provider. */
export function modelName(ref: string | null | undefined): string {
  if (!ref) return "—";
  const i = ref.indexOf(":");
  return i === -1 ? ref : ref.slice(i + 1);
}

export function provider(ref: string | null | undefined): string {
  if (!ref) return "";
  const i = ref.indexOf(":");
  return i === -1 ? "" : ref.slice(0, i);
}

export function relTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function dateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
