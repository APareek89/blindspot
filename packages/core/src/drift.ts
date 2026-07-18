import { and, desc, eq, getTableColumns, inArray } from "drizzle-orm";
import { driftEvents, evalRuns, getDb, recommendations, routes } from "@blindspot/db";
import { costPer1kCents } from "@blindspot/providers";
import { clampPagination, type PageInput } from "@blindspot/shared";
import { generateRecommendation } from "./recommend";

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
  if (!route.liveModel) throw new Error("route has no live model");
  const margin = opts.margin ?? 0.05;

  const prior = (
    await db
      .select()
      .from(evalRuns)
      .where(and(eq(evalRuns.routeId, opts.routeId), eq(evalRuns.modelRef, route.liveModel)))
      .orderBy(desc(evalRuns.createdAt))
      .limit(1)
  )[0];
  const oldScore = prior?.avgScore ?? null;

  if (!Number.isFinite(opts.simulateNewScore) || opts.simulateNewScore < 0 || opts.simulateNewScore > 1) {
    throw new Error("simulateNewScore must be between 0 and 1");
  }
  // Phase 7C keeps this as an explicitly free simulation. Real drift evals must enter through
  // the immutable estimate + confirmation path, never through this helper.
  const newScore = opts.simulateNewScore;
  await db.insert(evalRuns).values({
    routeId: opts.routeId,
    modelRef: route.liveModel,
    goldenSetVersion: prior?.goldenSetVersion ?? 1,
    avgScore: newScore,
    costPer1k: costPer1kCents(route.liveModel),
    latencyMs: prior?.latencyMs ?? null,
  });

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
        modelRef: route.liveModel,
        oldScore,
        newScore,
        action: "recommended",
      })
      .returning()
  )[0]!;

  // recover quality: propose the best passing alternative (cost is secondary here)
  const recommendation = await generateRecommendation(opts.routeId, { mode: "drift" });
  return { drifted: true, oldScore, newScore, driftEvent, recommendation };
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
