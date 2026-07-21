import { and, desc, eq, inArray } from "drizzle-orm";
import {
  driftEvents,
  evalRuns,
  getDb,
  goldenSets,
  recommendations,
  routes,
} from "@blindspot/db";
import { costPer1kCents } from "@blindspot/providers";
import { getRouteControlState } from "./workflows";

export interface OverviewActivity {
  kind: "recommendation" | "drift";
  routeName: string;
  at: Date;
  detail: string;
  status?: string;
}

/**
 * Overview KPIs (PRD §10.1) for a project. "$ saved" is expressed as **cents per 1k
 * tokens** (all money is cents; we don't assume a traffic volume) — the cost the route
 * would shed by taking the recommended cheaper model. Realized = already-approved swaps;
 * pending = still awaiting approval.
 */
export async function getOverview(projectId: string) {
  const db = getDb();

  const projectRoutes = await db
    .select()
    .from(routes)
    .where(eq(routes.projectId, projectId));
  const ids = projectRoutes.map((r) => r.id);

  if (ids.length === 0) {
    return {
      avgQuality: null as number | null,
      savedCentsPer1kRealized: 0,
      savedCentsPer1kPending: 0,
      savedCentsPer1kAwaitingRollout: 0,
      pendingApprovals: 0,
      driftAlerts: 0,
      routesHealthy: 0,
      routesAtRisk: 0,
      routesUnevaluated: 0,
      routeCount: 0,
      costVsQuality: [] as Array<{ routeName: string; costPer1kCents: number | null; quality: number | null; status: string }>,
      activity: [] as OverviewActivity[],
    };
  }

  const runs = await db
    .select()
    .from(evalRuns)
    .where(inArray(evalRuns.routeId, ids))
    .orderBy(desc(evalRuns.createdAt));
  const sets = await db
    .select({ routeId: goldenSets.routeId })
    .from(goldenSets)
    .where(inArray(goldenSets.routeId, ids));
  const recs = await db
    .select()
    .from(recommendations)
    .where(inArray(recommendations.routeId, ids))
    .orderBy(desc(recommendations.createdAt));
  const drifts = await db
    .select()
    .from(driftEvents)
    .where(inArray(driftEvents.routeId, ids))
    .orderBy(desc(driftEvents.createdAt));

  const routeName = new Map(projectRoutes.map((r) => [r.id, r.name]));
  const hasGolden = new Set(sets.map((s) => s.routeId));
  const realDrifts = drifts.filter((drift) => drift.source !== "simulation");
  const effectiveModels = new Map(
    await Promise.all(
      projectRoutes.map(async (route) => {
        const control = await getRouteControlState(route.id);
        return [
          route.id,
          control.integrationMode === "observe_only"
            ? control.observedModel ?? route.liveModel
            : route.liveModel,
        ] as const;
      }),
    ),
  );

  // latest live-model score per route
  const liveScore = new Map<string, number>();
  for (const r of projectRoutes) {
    const liveModel = effectiveModels.get(r.id) ?? null;
    if (!liveModel) continue;
    const run = runs.find(
      (x) =>
        x.routeId === r.id &&
        x.modelRef === liveModel &&
        x.status === "completed" &&
        x.avgScore != null &&
        x.planId != null &&
        x.examplesPlanned > 0 &&
        x.executionMode === "workflow_replay" &&
        x.scoreMethod === "criteria_mean",
    );
    if (run?.avgScore != null) liveScore.set(r.id, run.avgScore);
  }

  const qualities = [...liveScore.values()];
  const avgQuality =
    qualities.length > 0 ? qualities.reduce((a, b) => a + b, 0) / qualities.length : null;

  let healthy = 0;
  let atRisk = 0;
  let unevaluated = 0;
  const pendingByRoute = new Map<string, number>();
  for (const rec of recs) {
    if (rec.status === "pending") {
      pendingByRoute.set(rec.routeId, (pendingByRoute.get(rec.routeId) ?? 0) + 1);
    }
  }
  const costVsQuality = projectRoutes.map((r) => {
    const q = liveScore.get(r.id) ?? null;
    const liveModel = effectiveModels.get(r.id) ?? null;
    const pending = pendingByRoute.get(r.id) ?? 0;
    let status: "healthy" | "at_risk" | "unevaluated";
    if (!liveModel || !hasGolden.has(r.id) || q == null) {
      status = "unevaluated";
      unevaluated += 1;
    } else if (q < r.policyJson.minScore || pending > 0) {
      status = "at_risk";
      atRisk += 1;
    } else {
      status = "healthy";
      healthy += 1;
    }
    return {
      routeName: r.name,
      costPer1kCents: liveModel ? costPer1kCents(liveModel) : null,
      quality: q,
      status,
    };
  });

  // $ saved = cost the route sheds on the recommended cheaper model (cents / 1k tokens)
  const savings = (fromModel: string | null, toModel: string) => {
    if (!fromModel) return 0;
    const from = costPer1kCents(fromModel);
    const to = costPer1kCents(toModel);
    if (from == null || to == null) return 0;
    return Math.max(0, from - to);
  };
  let realized = 0;
  let pending = 0;
  let awaitingRollout = 0;
  const approvedRoutes = new Set<string>();
  for (const rec of recs) {
    if (rec.status === "pending") {
      pending += savings(rec.fromModel, rec.toModel);
    } else if (rec.status === "approved" && !approvedRoutes.has(rec.routeId)) {
      approvedRoutes.add(rec.routeId);
      const amount = savings(rec.fromModel, rec.toModel);
      if (effectiveModels.get(rec.routeId) === rec.toModel) realized += amount;
      else awaitingRollout += amount;
    }
  }

  const activity: OverviewActivity[] = [
    ...recs.slice(0, 20).map((r): OverviewActivity => ({
      kind: "recommendation",
      routeName: routeName.get(r.routeId) ?? "?",
      at: r.createdAt,
      detail: `${r.fromModel ?? "—"} → ${r.toModel}`,
      status: r.status,
    })),
    ...realDrifts.slice(0, 20).map((d): OverviewActivity => ({
      kind: "drift",
      routeName: routeName.get(d.routeId) ?? "?",
      at: d.createdAt,
      detail: `${d.modelRef} score ${d.oldScore != null ? d.oldScore.toFixed(2) : "—"} → ${d.newScore.toFixed(2)}`,
      status: d.action,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 15);

  return {
    avgQuality,
    savedCentsPer1kRealized: realized,
    savedCentsPer1kPending: pending,
    savedCentsPer1kAwaitingRollout: awaitingRollout,
    pendingApprovals: recs.filter((r) => r.status === "pending").length,
    driftAlerts: realDrifts.length,
    routesHealthy: healthy,
    routesAtRisk: atRisk,
    routesUnevaluated: unevaluated,
    routeCount: projectRoutes.length,
    costVsQuality,
    activity,
  };
}
