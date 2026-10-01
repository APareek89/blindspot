import type { CostQualityPoint, TrendBucket } from "@/lib/types";
import { preparedName } from "@/lib/format";

/** Score-over-time line with a dashed policy bar and golden-set version markers. */
export function ScoreChart({
  series,
  bar,
  height = 160,
}: {
  series: { score: number; version: number; at: string }[];
  bar?: number;
  height?: number;
}) {
  const width = 640;
  const padX = 12;
  const padY = 14;
  const w = width - padX * 2;
  const h = height - padY * 2;
  const yFor = (v: number) => padY + (1 - Math.max(0, Math.min(1, v))) * h;

  if (series.length === 0) {
    return <div className="empty small">No eval runs yet for the live model.</div>;
  }

  const xFor = (i: number) =>
    series.length === 1 ? padX + w / 2 : padX + (i / (series.length - 1)) * w;
  const pts = series.map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.score).toFixed(1)}`);

  // vertical markers where the golden-set version changes
  const markers: { x: number; version: number }[] = [];
  series.forEach((p, i) => {
    if (i === 0 || p.version !== series[i - 1].version) {
      markers.push({ x: xFor(i), version: p.version });
    }
  });

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <line
          key={g}
          x1={padX}
          x2={width - padX}
          y1={yFor(g)}
          y2={yFor(g)}
          stroke="var(--border)"
          strokeWidth={1}
        />
      ))}
      {markers.map((m, i) => (
        <g key={i}>
          <line x1={m.x} x2={m.x} y1={padY} y2={height - padY} stroke="var(--border-2)" strokeDasharray="2 3" />
          <text x={m.x + 3} y={padY + 9} fontSize="9" fill="var(--muted-2)">
            v{m.version}
          </text>
        </g>
      ))}
      {bar != null && (
        <line
          x1={padX}
          x2={width - padX}
          y1={yFor(bar)}
          y2={yFor(bar)}
          stroke="var(--warn)"
          strokeWidth={1.4}
          strokeDasharray="5 4"
        />
      )}
      <polyline points={pts.join(" ")} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
      {series.map((p, i) => (
        <circle
          key={i}
          cx={xFor(i)}
          cy={yFor(p.score)}
          r={3}
          fill={p.score >= (bar ?? 0) ? "var(--pass)" : "var(--danger)"}
        />
      ))}
    </svg>
  );
}

/** Cost (x, ¢/1k) vs quality (y, 0–1) scatter, dots colored by route health. */
export function CostQualityChart({ points }: { points: CostQualityPoint[] }) {
  const width = 640;
  const height = 240;
  const padL = 40;
  const padB = 30;
  const padT = 14;
  const padR = 14;
  const plotted = points.filter((p) => p.costPer1kCents != null && p.quality != null);

  if (plotted.length === 0) {
    return <div className="empty small">No evaluated routes yet — cost vs quality appears here.</div>;
  }

  const maxCost = Math.max(...plotted.map((p) => p.costPer1kCents as number), 0.1) * 1.15;
  const xFor = (c: number) => padL + (c / maxCost) * (width - padL - padR);
  const yFor = (q: number) => padT + (1 - q) * (height - padT - padB);
  const color = (s: string) =>
    s === "healthy" ? "var(--pass)" : s === "at_risk" ? "var(--warn)" : "var(--muted)";

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <g key={g}>
          <line x1={padL} x2={width - padR} y1={yFor(g)} y2={yFor(g)} stroke="var(--border)" />
          <text x={padL - 8} y={yFor(g) + 3} fontSize="9" fill="var(--muted-2)" textAnchor="end">
            {g.toFixed(2)}
          </text>
        </g>
      ))}
      {plotted.map((p, i) => (
        <g key={i}>
          <circle cx={xFor(p.costPer1kCents as number)} cy={yFor(p.quality as number)} r={5} fill={color(p.status)} />
          <text x={xFor(p.costPer1kCents as number) + 8} y={yFor(p.quality as number) + 3} fontSize="10" fill="var(--muted)">
            {preparedName(p.routeName, p)}
          </text>
        </g>
      ))}
      <text x={padL} y={height - 8} fontSize="9.5" fill="var(--muted-2)">
        cost ¢/1k →
      </text>
      <text x={padL - 34} y={padT + 4} fontSize="9.5" fill="var(--muted-2)">
        quality
      </text>
    </svg>
  );
}

/** Monthly executions (bars) with a failure overlay — the Monitor trend. */
export function TrendChart({ buckets }: { buckets: TrendBucket[] }) {
  const width = 640;
  const height = 180;
  const padL = 34;
  const padB = 22;
  const padT = 12;
  if (buckets.length === 0) {
    return <div className="empty small">No executions in this range yet.</div>;
  }
  const max = Math.max(...buckets.map((b) => b.executions), 1);
  const bw = (width - padL - 8) / buckets.length;
  const yFor = (v: number) => padT + (1 - v / max) * (height - padT - padB);
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {[0, 0.5, 1].map((g) => (
        <line key={g} x1={padL} x2={width - 8} y1={yFor(g * max)} y2={yFor(g * max)} stroke="var(--border)" />
      ))}
      {buckets.map((b, i) => {
        const x = padL + i * bw + 4;
        return (
          <g key={b.month}>
            <rect x={x} y={yFor(b.executions)} width={bw - 8} height={height - padB - yFor(b.executions)} fill="var(--accent)" rx={2} />
            {b.failures > 0 && (
              <rect x={x} y={yFor(b.failures)} width={bw - 8} height={height - padB - yFor(b.failures)} fill="var(--danger)" rx={2} />
            )}
            <text x={x + (bw - 8) / 2} y={height - 6} fontSize="8.5" fill="var(--muted-2)" textAnchor="middle">
              {b.month.slice(2)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
