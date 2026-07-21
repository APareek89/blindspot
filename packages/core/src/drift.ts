import { and, desc, eq, getTableColumns, inArray } from "drizzle-orm";
import { driftEvents, evalPlans, evalRuns, getDb, recommendations, routes } from "@blindspot/db";
import { clampPagination, type PageInput } from "@blindspot/shared";
import { generateRecommendation } from "./recommend";
import { getRouteControlState } from "./workflows";

/**
 * Drift check (PRD §5, §6): re-eval the live model (or inject a simulated post-version-bump
 * score) and compare to its prior score. If quality dropped past the margin OR fell below the
 * bar, record a drift_event and produce an approval-gated recommendation to recover quality.
 * Never auto-reverts unless the route opted into auto-approve (handled in generateRecommendation).
 */
export async function checkDrift(opts: {
  routeId: string;
  simulateNewScore: number;
  margin?: number;
}) {
  const db = getDb();
  const route = (await db.select().from(routes).where(eq(routes.id, opts.routeId)).limit(1))[0];
  if (!route) throw new Error("route not found");
  const control = await getRouteControlState(opts.routeId);
  const liveModel =
    control.integrationMode === "observe_only"
      ? control.observedModel ?? route.liveModel
      : route.liveModel;
  if (!liveModel) throw new Error("route has no live model");
  const margin = opts.margin ?? 0.05;

  const prior = (
    await db
      .select()
      .from(evalRuns)
      .where(and(eq(evalRuns.routeId, opts.routeId), eq(evalRuns.modelRef, liveModel)))
      .orderBy(desc(evalRuns.createdAt))
  ).find(
    (run) =>
      run.status === "completed" &&
      run.avgScore != null &&
      run.planId != null &&
      run.examplesPlanned > 0,
  );
  const oldScore = prior?.avgScore ?? null;

  if (!Number.isFinite(opts.simulateNewScore) || opts.simulateNewScore < 0 || opts.simulateNewScore > 1) {
    throw new Error("simulateNewScore must be between 0 and 1");
  }
  // Demonstration-only: a simulation must never become route health or recommendation evidence.
  // Real quality drift enters through an authorized eval plan below.
  const newScore = opts.simulateNewScore;

  const drifted =
    (oldScore != null && newScore < oldScore - margin) ||
    newScore < route.policyJson.minScore;

  if (!drifted) {
    return { drifted: false, oldScore, newScore, driftEvent: null, recommendation: null };
  }

  const driftEvent = (
    await db
      .insert(driftEvents)
      .values({
        routeId: opts.routeId,
        modelRef: liveModel,
        oldScore,
        newScore,
        action: "none",
        source: "simulation",
      })
      .returning()
  )[0]!;

  return { drifted: true, oldScore, newScore, driftEvent, recommendation: null };
}

/**
 * Compare a newly completed live-model run with a prior evidence-backed baseline.
 * Both scores must come from real, authorized golden-set examples.
 */
export async function detectGoldenEvalDrift(opts: {
  routeId: string;
  evalRunId: string;
  margin?: number;
}) {
  const db = getDb();
  const current = (
    await db.select().from(evalRuns).where(eq(evalRuns.id, opts.evalRunId)).limit(1)
  )[0];
  const currentPlan = current?.planId
    ? (
        await db
          .select()
          .from(evalPlans)
          .where(eq(evalPlans.id, current.planId))
          .limit(1)
      )[0]
    : null;
  const route = (
    await db.select().from(routes).where(eq(routes.id, opts.routeId)).limit(1)
  )[0];
  const control = await getRouteControlState(opts.routeId);
  const liveModel =
    control.integrationMode === "observe_only"
      ? control.observedModel ?? route?.liveModel
      : route?.liveModel;
  if (
    !current ||
    !route ||
    !liveModel ||
    current.modelRef !== liveModel ||
    current.status !== "completed" ||
    current.avgScore == null ||
    currentPlan?.status !== "completed" ||
    currentPlan.executionMode !== "workflow_replay" ||
    current.scoreMethod !== "criteria_mean" ||
    current.examplesPlanned === 0
  ) {
    return null;
  }
  const prior = (
    await db
      .select({ run: evalRuns, plan: evalPlans })
      .from(evalRuns)
      .innerJoin(evalPlans, eq(evalRuns.planId, evalPlans.id))
      .where(
        and(
          eq(evalRuns.routeId, opts.routeId),
          eq(evalRuns.modelRef, current.modelRef),
          eq(evalRuns.goldenSetVersion, current.goldenSetVersion),
          eq(evalRuns.executionMode, "workflow_replay"),
          eq(evalRuns.scoreMethod, "criteria_mean"),
          eq(evalPlans.status, "completed"),
          eq(evalPlans.selectionHash, currentPlan.selectionHash),
        ),
      )
      .orderBy(desc(evalRuns.createdAt))
  ).find(
    ({ run }) =>
      run.id !== current.id &&
      run.status === "completed" &&
      run.avgScore != null &&
      run.examplesPlanned > 0,
  )?.run;
  if (prior?.avgScore == null) return null;
  const margin = opts.margin ?? 0.05;
  const drifted =
    current.avgScore < prior.avgScore - margin || current.avgScore < route.policyJson.minScore;
  if (!drifted) return null;
  const event = (
    await db
      .insert(driftEvents)
      .values({
        routeId: opts.routeId,
        modelRef: current.modelRef,
        oldScore: prior.avgScore,
        newScore: current.avgScore,
        action: "recommended",
        source: "golden_eval",
      })
      .returning()
  )[0]!;
  const recommendation = await generateRecommendation(opts.routeId, {
    mode: "drift",
    planId: currentPlan.id,
  });
  return { event, recommendation };
}

/**
 * Project-wide drift timeline (PRD §10 Drift): every drift event across the project's
 * routes, newest first, with the route name and the pending recommendation (if any) that
 * the event produced — so the UI can link each drift to its approval.
 */
export async function listDriftEvents(projectId: string, page?: PageInput) {
  const db = getDb();
  const { limit, offset } = clampPagination(page?.limit, page?.offset);

  const rows = await db
    .select({ ...getTableColumns(driftEvents), routeName: routes.name })
    .from(driftEvents)
    .innerJoin(routes, eq(driftEvents.routeId, routes.id))
    .where(eq(routes.projectId, projectId))
    .orderBy(desc(driftEvents.createdAt))
    .limit(limit)
    .offset(offset);
  if (rows.length === 0) return { drift_events: [] as Array<(typeof rows)[number] & { recommendationId: string | null }> };

  // link each drift → the pending rec on that route targeting a different model
  const routeIds = [...new Set(rows.map((r) => r.routeId))];
  const pendingRecs = await db
    .select({ id: recommendations.id, routeId: recommendations.routeId, toModel: recommendations.toModel })
    .from(recommendations)
    .where(and(inArray(recommendations.routeId, routeIds), eq(recommendations.status, "pending")))
    .orderBy(desc(recommendations.createdAt));
  const recByRoute = new Map<string, string>();
  for (const r of pendingRecs) if (!recByRoute.has(r.routeId)) recByRoute.set(r.routeId, r.id);

  return {
    drift_events: rows.map((r) => ({ ...r, recommendationId: recByRoute.get(r.routeId) ?? null })),
  };
}
