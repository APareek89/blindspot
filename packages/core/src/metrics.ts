import { and, eq, gte, lt, sql } from "drizzle-orm";
import {
  executionFeedback,
  getDb,
  workflowExecutions,
  workflowNodes,
  workflowSpans,
} from "@blindspot/db";
import type { MetricsWindow } from "@blindspot/shared";

export interface MetricPoint {
  current: number | null;
  previous: number | null;
  /** (current - previous) / previous * 100; null when previous is 0 or null. */
  deltaPct: number | null;
}

export interface TrendBucket {
  month: string; // "YYYY-MM"
  executions: number;
  failures: number;
  avgLatencyMs: number | null;
  costCents: number;
  feedbackUp: number;
  feedbackDown: number;
}

export interface MonitorNode {
  id: string;
  name: string;
  kind: string;
}

export interface WorkflowMetrics {
  window: MetricsWindow;
  workflowId: string;
  nodeId: string | null;
  executions: MetricPoint; // volume
  failureRatePct: MetricPoint; // A.2 — executions with status='error' / total
  noAnswerRatePct: MetricPoint; // A.3 — executions not 'completed' / total (app-signaled)
  avgLatencyMs: MetricPoint;
  p95LatencyMs: MetricPoint;
  costCents: MetricPoint; // A.4 total
  feedbackScorePct: MetricPoint; // A.5 — up / (up+down)
  trend: TrendBucket[];
  nodes: MonitorNode[];
}

const WINDOW_DAYS: Record<MetricsWindow, number> = { "7d": 7, "30d": 30, "90d": 90 };

function windowRange(window: MetricsWindow, now: Date) {
  const ms = WINDOW_DAYS[window] * 24 * 60 * 60 * 1000;
  return {
    start: new Date(now.getTime() - ms),
    end: now,
    prevStart: new Date(now.getTime() - 2 * ms),
    prevEnd: new Date(now.getTime() - ms),
  };
}

function point(current: number | null, previous: number | null): MetricPoint {
  const deltaPct =
    previous == null || previous === 0 || current == null
      ? null
      : ((current - previous) / previous) * 100;
  return { current, previous, deltaPct };
}

/** Execution-level aggregates for a workflow over [start, end). */
async function executionAggregates(workflowId: string, start: Date, end: Date) {
  const db = getDb();
  const row = (
    await db
      .select({
        executions: sql<number>`count(*)::int`,
        failures: sql<number>`count(*) filter (where ${workflowExecutions.status} = 'error')::int`,
        noAnswer: sql<number>`count(*) filter (where ${workflowExecutions.status} <> 'completed')::int`,
      })
      .from(workflowExecutions)
      .where(
        and(
          eq(workflowExecutions.workflowId, workflowId),
          gte(workflowExecutions.startedAt, start),
          lt(workflowExecutions.startedAt, end),
        ),
      )
  )[0]!;
  const executions = row.executions ?? 0;
  return {
    executions,
    failureRatePct: executions === 0 ? null : (row.failures / executions) * 100,
    noAnswerRatePct: executions === 0 ? null : (row.noAnswer / executions) * 100,
  };
}

/**
 * Span-level latency/cost aggregates. Scoped to a node when nodeId is provided; otherwise the
 * whole workflow (spans joined through executions). Errored spans are excluded from latency.
 */
async function spanAggregates(
  workflowId: string,
  nodeId: string | null,
  start: Date,
  end: Date,
): Promise<{ avgLatencyMs: number | null; p95LatencyMs: number | null; costCents: number }> {
  const db = getDb();
  if (nodeId) {
    const row = (
      await db
        .select({
          avgLatencyMs: sql<
            number | null
          >`avg(${workflowSpans.latencyMs}) filter (where ${workflowSpans.status} = 'ok')::float`,
          p95LatencyMs: sql<
            number | null
          >`percentile_cont(0.95) within group (order by ${workflowSpans.latencyMs}) filter (where ${workflowSpans.status} = 'ok')::float`,
          costCents: sql<number>`coalesce(sum(${workflowSpans.costCents}), 0)::float`,
        })
        .from(workflowSpans)
        .where(
          and(
            eq(workflowSpans.nodeId, nodeId),
            gte(workflowSpans.startedAt, start),
            lt(workflowSpans.startedAt, end),
          ),
        )
    )[0]!;
    return row;
  }
  const row = (
    await db
      .select({
        avgLatencyMs: sql<
          number | null
        >`avg(${workflowSpans.latencyMs}) filter (where ${workflowSpans.status} = 'ok')::float`,
        p95LatencyMs: sql<
          number | null
        >`percentile_cont(0.95) within group (order by ${workflowSpans.latencyMs}) filter (where ${workflowSpans.status} = 'ok')::float`,
        costCents: sql<number>`coalesce(sum(${workflowSpans.costCents}), 0)::float`,
      })
      .from(workflowSpans)
      .innerJoin(workflowExecutions, eq(workflowSpans.executionId, workflowExecutions.id))
      .where(
        and(
          eq(workflowExecutions.workflowId, workflowId),
          gte(workflowSpans.startedAt, start),
          lt(workflowSpans.startedAt, end),
        ),
      )
  )[0]!;
  return row;
}

/** Feedback up/down counts for a workflow over [start, end). Always workflow-level. */
async function feedbackAggregates(workflowId: string, start: Date, end: Date) {
  const db = getDb();
  const row = (
    await db
      .select({
        up: sql<number>`count(*) filter (where ${executionFeedback.kind} = 'up')::int`,
        down: sql<number>`count(*) filter (where ${executionFeedback.kind} = 'down')::int`,
      })
      .from(executionFeedback)
      .where(
        and(
          eq(executionFeedback.workflowId, workflowId),
          gte(executionFeedback.createdAt, start),
          lt(executionFeedback.createdAt, end),
        ),
      )
  )[0]!;
  const total = row.up + row.down;
  return { scorePct: total === 0 ? null : (row.up / total) * 100 };
}

async function monthlyTrend(workflowId: string, since: Date): Promise<TrendBucket[]> {
  const db = getDb();
  const execRows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${workflowExecutions.startedAt}), 'YYYY-MM')`,
      executions: sql<number>`count(*)::int`,
      failures: sql<number>`count(*) filter (where ${workflowExecutions.status} = 'error')::int`,
    })
    .from(workflowExecutions)
    .where(and(eq(workflowExecutions.workflowId, workflowId), gte(workflowExecutions.startedAt, since)))
    .groupBy(sql`date_trunc('month', ${workflowExecutions.startedAt})`)
    .orderBy(sql`date_trunc('month', ${workflowExecutions.startedAt})`);
  const spanRows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${workflowSpans.startedAt}), 'YYYY-MM')`,
      avgLatencyMs: sql<
        number | null
      >`avg(${workflowSpans.latencyMs}) filter (where ${workflowSpans.status} = 'ok')::float`,
      costCents: sql<number>`coalesce(sum(${workflowSpans.costCents}), 0)::float`,
    })
    .from(workflowSpans)
    .innerJoin(workflowExecutions, eq(workflowSpans.executionId, workflowExecutions.id))
    .where(and(eq(workflowExecutions.workflowId, workflowId), gte(workflowSpans.startedAt, since)))
    .groupBy(sql`date_trunc('month', ${workflowSpans.startedAt})`);
  const fbRows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${executionFeedback.createdAt}), 'YYYY-MM')`,
      up: sql<number>`count(*) filter (where ${executionFeedback.kind} = 'up')::int`,
      down: sql<number>`count(*) filter (where ${executionFeedback.kind} = 'down')::int`,
    })
    .from(executionFeedback)
    .where(and(eq(executionFeedback.workflowId, workflowId), gte(executionFeedback.createdAt, since)))
    .groupBy(sql`date_trunc('month', ${executionFeedback.createdAt})`);

  const spanByMonth = new Map(spanRows.map((r) => [r.month, r]));
  const fbByMonth = new Map(fbRows.map((r) => [r.month, r]));
  return execRows.map((r) => ({
    month: r.month,
    executions: r.executions,
    failures: r.failures,
    avgLatencyMs: spanByMonth.get(r.month)?.avgLatencyMs ?? null,
    costCents: spanByMonth.get(r.month)?.costCents ?? 0,
    feedbackUp: fbByMonth.get(r.month)?.up ?? 0,
    feedbackDown: fbByMonth.get(r.month)?.down ?? 0,
  }));
}

export async function getWorkflowMetrics(
  projectId: string,
  opts: { workflowId: string; nodeId?: string | null; window: MetricsWindow; now?: Date },
): Promise<WorkflowMetrics> {
  const db = getDb();
  const now = opts.now ?? new Date();
  const nodeId = opts.nodeId ?? null;
  const { start, end, prevStart, prevEnd } = windowRange(opts.window, now);

  const [curExec, prevExec, curSpan, prevSpan, curFb, prevFb, trend, nodeRows] = await Promise.all([
    executionAggregates(opts.workflowId, start, end),
    executionAggregates(opts.workflowId, prevStart, prevEnd),
    spanAggregates(opts.workflowId, nodeId, start, end),
    spanAggregates(opts.workflowId, nodeId, prevStart, prevEnd),
    feedbackAggregates(opts.workflowId, start, end),
    feedbackAggregates(opts.workflowId, prevStart, prevEnd),
    monthlyTrend(opts.workflowId, new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)),
    db
      .select({ id: workflowNodes.id, name: workflowNodes.name, kind: workflowNodes.kind })
      .from(workflowNodes)
      .where(eq(workflowNodes.workflowId, opts.workflowId)),
  ]);

  return {
    window: opts.window,
    workflowId: opts.workflowId,
    nodeId,
    executions: point(curExec.executions, prevExec.executions),
    failureRatePct: point(curExec.failureRatePct, prevExec.failureRatePct),
    noAnswerRatePct: point(curExec.noAnswerRatePct, prevExec.noAnswerRatePct),
    avgLatencyMs: point(curSpan.avgLatencyMs ?? null, prevSpan.avgLatencyMs ?? null),
    p95LatencyMs: point(curSpan.p95LatencyMs ?? null, prevSpan.p95LatencyMs ?? null),
    costCents: point(curSpan.costCents ?? 0, prevSpan.costCents ?? 0),
    feedbackScorePct: point(curFb.scorePct, prevFb.scorePct),
    trend,
    nodes: nodeRows.map((n) => ({ id: n.id, name: n.name, kind: n.kind })),
  };
}
