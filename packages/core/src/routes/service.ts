import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  candidates,
  evalRuns,
  getDb,
  goldenSets,
  recommendations,
  routes,
  traces,
} from "@blindspot/db";
import { costPer1kCents } from "@blindspot/providers";
import { clampPagination, type PageInput, type Policy } from "@blindspot/shared";
import { getRouteControlState } from "../workflows";

/** A route with its live model, its latest quality score, and a health verdict. */
export interface RouteSummary {
  exampleKind?:string|null;
  id: string;
  name: string;
  liveModel: string | null;
  policy: Policy;
  autoApprove: boolean;
  createdAt: Date;
  /** Latest eval score for the live model (0–1), or null if never evaluated. */
  quality: number | null;
  /** Estimated cost per 1k tokens (cents) for the live model, or null if unpriced. */
  costPer1kCents: number | null;
  /** Recent live-model scores oldest→newest, for a sparkline. */
  sparkline: number[];
  candidateCount: number;
  hasGoldenSet: boolean;
  pendingRecs: number;
  /** healthy = at/above bar · at_risk = below bar or pending rec · unevaluated = no golden set/score. */
  status: "healthy" | "at_risk" | "unevaluated";
}

/** The route + owning project, or null if the name isn't in this project (tenant guard). */
export async function getOwnedRoute(projectId: string, name: string) {
  const rows = await getDb()
    .select()
    .from(routes)
    .where(and(eq(routes.projectId, projectId), eq(routes.name, name)))
    .limit(1);
  return rows[0] ?? null;
}

function statusFor(
  liveModel: string | null,
  quality: number | null,
  minScore: number,
  hasGoldenSet: boolean,
  pendingRecs: number,
): RouteSummary["status"] {
  if (!liveModel || !hasGoldenSet || quality == null) return "unevaluated";
  if (quality < minScore || pendingRecs > 0) return "at_risk";
  return "healthy";
}

/** Paginated route list for a project, each enriched with quality + cost + status. */
export async function listRoutes(
  projectId: string,
  page?: PageInput,
): Promise<{ routes: RouteSummary[]; total: number }> {
  const db = getDb();
  const { limit, offset } = clampPagination(page?.limit, page?.offset);

  const totalRow = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(routes)
    .where(eq(routes.projectId, projectId));
  const total = totalRow[0]?.n ?? 0;

  const rows = await db
    .select()
    .from(routes)
    .where(eq(routes.projectId, projectId))
    .orderBy(desc(routes.createdAt))
    .limit(limit)
    .offset(offset);
  if (rows.length === 0) return { routes: [], total };

  const ids = rows.map((r) => r.id);
  // One pass over eval runs / candidates / golden sets / pending recs for these routes.
  const runs = await db
    .select()
    .from(evalRuns)
    .where(inArray(evalRuns.routeId, ids))
    .orderBy(desc(evalRuns.createdAt));
  const cands = await db
    .select({ routeId: candidates.routeId, n: sql<number>`count(*)::int` })
    .from(candidates)
    .where(inArray(candidates.routeId, ids))
    .groupBy(candidates.routeId);
  const sets = await db
    .select({ routeId: goldenSets.routeId, n: sql<number>`count(*)::int` })
    .from(goldenSets)
    .where(inArray(goldenSets.routeId, ids))
    .groupBy(goldenSets.routeId);
  const pending = await db
    .select({ routeId: recommendations.routeId, n: sql<number>`count(*)::int` })
    .from(recommendations)
    .where(
      and(inArray(recommendations.routeId, ids), eq(recommendations.status, "pending")),
    )
    .groupBy(recommendations.routeId);

  const candCount = new Map(cands.map((c) => [c.routeId, c.n]));
  const setCount = new Map(sets.map((s) => [s.routeId, s.n]));
  const pendingCount = new Map(pending.map((p) => [p.routeId, p.n]));
  const controlStates = new Map(
    await Promise.all(
      rows.map(async (route) => [route.id, await getRouteControlState(route.id)] as const),
    ),
  );

  const summaries = rows.map((r): RouteSummary => {
    const control = controlStates.get(r.id);
    const liveModel =
      control?.integrationMode === "observe_only"
        ? control.observedModel ?? r.liveModel
        : r.liveModel;
    const liveRuns = runs.filter(
      (run): run is (typeof runs)[number] & { avgScore: number } =>
        run.routeId === r.id &&
        run.modelRef === liveModel &&
        run.status === "completed" &&
        run.avgScore != null &&
        run.planId != null &&
        run.examplesPlanned > 0 &&
        run.executionMode === "workflow_replay" &&
        run.scoreMethod === "criteria_mean",
    );
    const quality = liveRuns[0]?.avgScore ?? null; // runs are newest-first
    const sparkline = liveRuns
      .slice(0, 12)
      .map((run) => run.avgScore)
      .reverse();
    const hasGoldenSet = (setCount.get(r.id) ?? 0) > 0;
    const pendingRecs = pendingCount.get(r.id) ?? 0;
    return {
      exampleKind:r.exampleKind,
      id: r.id,
      name: r.name,
      liveModel,
      policy: r.policyJson,
      autoApprove: r.autoApprove,
      createdAt: r.createdAt,
      quality,
      costPer1kCents: liveModel ? costPer1kCents(liveModel) : null,
      sparkline,
      candidateCount: candCount.get(r.id) ?? 0,
      hasGoldenSet,
      pendingRecs,
      status: statusFor(liveModel, quality, r.policyJson.minScore, hasGoldenSet, pendingRecs),
    };
  });

  return { routes: summaries, total };
}

/** A candidate model with its most recent back-test evidence. */
export interface CandidateDetail {
  id: string;
  modelRef: string;
  source: string;
  enabled: boolean;
  isLive: boolean;
  score: number | null;
  costPer1kCents: number | null;
  latencyMs: number | null;
  lastEvaluatedAt: Date | null;
}

/** Full route detail: candidate pool + score-over-time + golden sets + pending recs. */
export async function getRouteDetail(projectId: string, name: string) {
  const db = getDb();
  const route = await getOwnedRoute(projectId, name);
  if (!route) return null;
  const control = await getRouteControlState(route.id);
  const effectiveLiveModel =
    control.integrationMode === "observe_only"
      ? control.observedModel ?? route.liveModel
      : route.liveModel;

  const cands = await db
    .select()
    .from(candidates)
    .where(eq(candidates.routeId, route.id))
    .orderBy(desc(candidates.createdAt));
  const runs = await db
    .select()
    .from(evalRuns)
    .where(eq(evalRuns.routeId, route.id))
    .orderBy(desc(evalRuns.createdAt));
  const sets = await db
    .select()
    .from(goldenSets)
    .where(eq(goldenSets.routeId, route.id))
    .orderBy(desc(goldenSets.version));
  const recs = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.routeId, route.id))
    .orderBy(desc(recommendations.createdAt));

  // latest eval per model → candidate evidence
  const completedRuns = runs.filter(
    (run): run is (typeof runs)[number] & { avgScore: number } =>
      run.status === "completed" &&
      run.avgScore != null &&
      run.planId != null &&
      run.examplesPlanned > 0,
  );
  const latest = new Map<string, (typeof completedRuns)[number]>();
  for (const r of completedRuns) if (!latest.has(r.modelRef)) latest.set(r.modelRef, r);

  const candidateDetails: CandidateDetail[] = cands.map((c) => {
    const run = latest.get(c.modelRef);
    return {
      id: c.id,
      modelRef: c.modelRef,
      source: c.source,
      enabled: c.enabled,
      isLive: c.modelRef === effectiveLiveModel,
      score: run?.avgScore ?? null,
      costPer1kCents: costPer1kCents(c.modelRef),
      latencyMs: run?.latencyMs ?? null,
      lastEvaluatedAt: run?.createdAt ?? null,
    };
  });

  // score-over-time for the live model (oldest→newest) with golden-set version markers
  const liveSeries = effectiveLiveModel
    ? completedRuns
        .filter(
          (r) =>
            r.modelRef === effectiveLiveModel &&
            r.executionMode === "workflow_replay" &&
            r.scoreMethod === "criteria_mean",
        )
        .map((r) => ({ score: r.avgScore, version: r.goldenSetVersion, at: r.createdAt }))
        .reverse()
    : [];

  return {
    route: {
      exampleKind:route.exampleKind,
      id: route.id,
      name: route.name,
      liveModel: effectiveLiveModel,
      policy: route.policyJson,
      autoApprove: route.autoApprove,
      createdAt: route.createdAt,
      costPer1kCents: effectiveLiveModel ? costPer1kCents(effectiveLiveModel) : null,
      integrationMode: control.integrationMode,
      observedModel: control.observedModel,
    },
    candidates: candidateDetails,
    scoreSeries: liveSeries,
    goldenSets: sets,
    pendingRecs: recs.filter((r) => r.status === "pending").length,
  };
}

/** Edit a route's policy bar and/or per-route auto-approve toggle (PRD §10 route detail). */
export async function updateRoute(
  projectId: string,
  name: string,
  patch: { minScore?: number; autoApprove?: boolean },
) {
  const db = getDb();
  const route = await getOwnedRoute(projectId, name);
  if (!route) return null;

  const nextPolicy: Policy =
    patch.minScore != null
      ? { ...route.policyJson, minScore: patch.minScore }
      : route.policyJson;

  const updated = (
    await db
      .update(routes)
      .set({
        policyJson: nextPolicy,
        autoApprove: patch.autoApprove ?? route.autoApprove,
      })
      .where(eq(routes.id, route.id))
      .returning()
  )[0];
  return updated ?? null;
}

/** Remove a candidate model from a route. Refuses to remove the live model. */
export async function removeCandidate(
  projectId: string,
  name: string,
  modelRef: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  const route = await getOwnedRoute(projectId, name);
  if (!route) return { ok: false, error: "route not found" };
  const control = await getRouteControlState(route.id);
  const effectiveLiveModel =
    control.integrationMode === "observe_only"
      ? control.observedModel ?? route.liveModel
      : route.liveModel;
  if (effectiveLiveModel === modelRef) {
    return { ok: false, error: "cannot remove the live model — approve another candidate first" };
  }
  await db
    .delete(candidates)
    .where(and(eq(candidates.routeId, route.id), eq(candidates.modelRef, modelRef)));
  return { ok: true };
}

/** Paginated trace list for a project (optionally one route), newest first. */
export async function listTraces(
  projectId: string,
  opts?: { routeName?: string; limit?: string | number; offset?: string | number },
) {
  const db = getDb();
  const { limit, offset } = clampPagination(opts?.limit, opts?.offset);

  const where = opts?.routeName
    ? and(eq(traces.projectId, projectId),eq(routes.projectId, projectId), eq(routes.name, opts.routeName))
    : eq(traces.projectId, projectId);

  const rows = await db
    .select({
      id: traces.id,
      routeId: traces.routeId,
      routeName: routes.name,
      model: traces.model,
      input: traces.input,
      output: traces.output,
      costCents: traces.costCents,
      latencyMs: traces.latencyMs,
      createdAt: traces.createdAt,
    })
    .from(traces)
    .leftJoin(routes, eq(traces.routeId, routes.id))
    .where(where)
    .orderBy(desc(traces.createdAt))
    .limit(limit)
    .offset(offset);

  return { traces: rows, limit, offset };
}
