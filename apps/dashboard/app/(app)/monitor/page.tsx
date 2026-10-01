import { PreparedBadge, PreparedNotice, isPrepared } from "@/components/PreparedNotice";
import Link from "next/link";
import { TrendChart } from "@/components/charts";
import { PageError } from "@/components/PageError";
import { Empty } from "@/components/ui";
import { requireApi } from "@/lib/session";
import { cents, ms, pct, preparedName } from "@/lib/format";
import type { MetricPoint, MetricsWindow, WorkflowMetrics } from "@/lib/types";

export const dynamic = "force-dynamic";

const WINDOWS: MetricsWindow[] = ["7d", "30d", "90d"];

/** A scorecard: current value + a signed delta vs the previous equal period. */
function Scorecard({
  label,
  point,
  render,
  goodDown = false,
}: {
  label: string;
  point: MetricPoint;
  render: (v: number | null) => string;
  goodDown?: boolean;
}) {
  const d = point.deltaPct;
  const good = d == null ? undefined : goodDown ? d <= 0 : d >= 0;
  const color = good === undefined ? undefined : good ? "var(--pass)" : "var(--danger)";
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{render(point.current)}</div>
      <div className="kpi-foot" style={color ? { color } : undefined}>
        {d == null ? "no prior period" : `${pct(d)} vs previous`}
      </div>
    </div>
  );
}

export default async function MonitorPage({
  searchParams,
}: {
  searchParams: Promise<{ workflowId?: string; nodeId?: string; window?: string }>;
}) {
  const sp = await searchParams;
  const client = await requireApi();

  let workflows;
  try {
    workflows = (await client.listWorkflows()).workflows;
  } catch (e) {
    return <PageError error={e} />;
  }
  if (workflows.length === 0) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Monitor</h1>
            <p>Latency, cost, failures and feedback across your agent.</p>
          </div>
        </div>
        <Empty emoji="◍" title="No workflows yet">
          <p className="muted small">Connect an app — once it sends spans, Monitor lights up here.</p>
        </Empty>
      </>
    );
  }

  const workflowId = sp.workflowId ?? workflows[0]!.id;
  const window = (WINDOWS as string[]).includes(sp.window ?? "") ? (sp.window as MetricsWindow) : "7d";
  const nodeId = sp.nodeId;

  let m: WorkflowMetrics;
  try {
    m = await client.metrics({ workflowId, nodeId, window });
  } catch (e) {
    return <PageError error={e} />;
  }

  const qp = (over: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = { workflowId, nodeId, window, ...over };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    return `/monitor?${p.toString()}`;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Monitor</h1>
          <p>Latency, cost, failures and feedback — {window} vs the previous {window}.</p>
        </div>
      </div>

      {isPrepared(workflows.find(w => w.id === workflowId)) && <PreparedNotice />}
      {/* workflow + window selectors (server-rendered links) */}
      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {workflows.map((w) => (
          <Link
            key={w.id}
            href={qp({ workflowId: w.id, nodeId: undefined })}
            className={`badge ${w.id === workflowId ? "accent" : "neutral"}`}
          >
            {preparedName(w.name, w)} · {w.environment} <PreparedBadge record={w} />
          </Link>
        ))}
        <span style={{ flex: 1 }} />
        {WINDOWS.map((win) => (
          <Link key={win} href={qp({ window: win })} className={`badge ${win === window ? "accent" : "neutral"}`}>
            {win}
          </Link>
        ))}
      </div>

      {/* node filter */}
      <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <Link href={qp({ nodeId: undefined })} className={`badge ${!nodeId ? "cyan" : "neutral"}`}>
          All nodes
        </Link>
        {m.nodes.map((n) => (
          <Link key={n.id} href={qp({ nodeId: n.id })} className={`badge ${n.id === nodeId ? "cyan" : "neutral"}`}>
            {n.name}
          </Link>
        ))}
      </div>

      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <Scorecard label="Executions" point={m.executions} render={(v) => (v == null ? "—" : String(v))} />
        <Scorecard label="Avg latency" point={m.avgLatencyMs} render={ms} goodDown />
        <Scorecard label="p95 latency" point={m.p95LatencyMs} render={ms} goodDown />
        <Scorecard label="Cost" point={m.costCents} render={cents} goodDown />
      </div>
      <div className="grid cols-4" style={{ marginBottom: 6 }}>
        <Scorecard label="Failure rate" point={m.failureRatePct} render={(v) => (v == null ? "—" : `${v.toFixed(0)}%`)} goodDown />
        <Scorecard label="No-answer rate" point={m.noAnswerRatePct} render={(v) => (v == null ? "—" : `${v.toFixed(0)}%`)} goodDown />
        <Scorecard label="Feedback 👍" point={m.feedbackScorePct} render={(v) => (v == null ? "—" : `${v.toFixed(0)}%`)} />
        <div className="card kpi">
          <div className="kpi-label">Node filter</div>
          <div className="kpi-value" style={{ fontSize: 16 }}>
            {nodeId ? (m.nodes.find((n) => n.id === nodeId)?.name ?? "—") : "All nodes"}
          </div>
          <div className="kpi-foot">
            latency · cost · errors are node-scoped; failure, no-answer &amp; feedback are workflow-level
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 4 }}>
          Monthly trend
        </div>
        <div className="card-sub" style={{ marginBottom: 12 }}>
          Executions per month (red = failures).
        </div>
        <TrendChart buckets={m.trend} />
      </div>
    </>
  );
}
