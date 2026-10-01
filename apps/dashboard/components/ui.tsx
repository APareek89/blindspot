import { CircleDashed } from "lucide-react";
import type { RouteStatus, GoldenOrigin, RecStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: RouteStatus }) {
  const map: Record<RouteStatus, [string, string]> = {
    healthy: ["pass", "Healthy"],
    at_risk: ["warn", "At risk"],
    unevaluated: ["neutral", "Unevaluated"],
  };
  const [cls, label] = map[status];
  return (
    <span className={`badge ${cls}`}>
      <span className="bdot" />
      {label}
    </span>
  );
}

export function OriginBadge({ origin }: { origin: GoldenOrigin }) {
  const map: Record<GoldenOrigin, [string, string]> = {
    upload: ["cyan", "Uploaded"],
    agent: ["accent", "Agent-generated"],
    grown: ["pass", "Grown"],
  };
  const [cls, label] = map[origin];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function RecStatusBadge({ status }: { status: RecStatus }) {
  const map: Record<RecStatus, [string, string]> = {
    pending: ["warn", "Pending"],
    approved: ["pass", "Approved"],
    rejected: ["neutral", "Rejected"],
  };
  const [cls, label] = map[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function LabelBadge({ label }: { label: string }) {
  const cls = label === "pass" ? "pass" : label === "fail" ? "danger" : "neutral";
  return <span className={`badge ${cls}`}>{label}</span>;
}

/** Tiny inline-SVG sparkline of scores (0–1). */
export function Sparkline({
  values,
  width = 96,
  height = 26,
  color = "var(--cyan)",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (!values || values.length === 0) {
    return <span className="muted small">no data</span>;
  }
  if (values.length === 1) {
    const cy = height - values[0] * height;
    return (
      <svg width={width} height={height}>
        <circle cx={width / 2} cy={cy} r={2.5} fill={color} />
      </svg>
    );
  }
  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w;
    const y = pad + (1 - Math.max(0, Math.min(1, v))) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Horizontal bar for a 0–1 value. */
export function Meter({ value, color = "var(--accent)" }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="meter">
      <span style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Empty({
  emoji = "◎",
  title,
  children,
}: {
  emoji?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="emoji" aria-hidden="true"><CircleDashed size={28} /></div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
