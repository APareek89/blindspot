import { and, desc, eq, getTableColumns } from "drizzle-orm";
import {
  evalExampleResults,
  evalPlans,
  evalRuns,
  getDb,
  recommendations,
  routes,
} from "@blindspot/db";
import { costPer1kCents } from "@blindspot/providers";
import { clampPagination, type Evidence } from "@blindspot/shared";

const COST_UNKNOWN = Number.POSITIVE_INFINITY;

/**
 * Policy → Recommendation (PRD §3, §6). Look at the latest eval per candidate model
 * for a route; if a candidate passes the score bar AND is cheaper than the live model,
 * propose a swap with evidence. NEVER switches silently unless the route opted into
 * auto-approve. Returns the created/existing recommendation, or null if none warranted.
 */
export async function generateRecommendation(
  routeId: string,
  opts?: { mode?: "cost" | "drift"; planId?: string },
) {
  const mode = opts?.mode ?? "cost";
  const db = getDb();
  const route = (await db.select().from(routes).where(eq(routes.id, routeId)).limit(1))[0];
  if (!route) return null;

  const evidencePlan = (
    await db
      .select()
      .from(evalPlans)
      .where(
        opts?.planId
          ? and(eq(evalPlans.id, opts.planId), eq(evalPlans.routeId, routeId))
          : and(eq(evalPlans.routeId, routeId), eq(evalPlans.status, "completed")),
      )
      .orderBy(desc(evalPlans.completedAt), desc(evalPlans.createdAt))
      .limit(1)
  )[0];
  if (!evidencePlan || evidencePlan.status !== "completed") return null;

  const minScore = route.policyJson.minScore;
  const runs = await db
    .select()
    .from(evalRuns)
    .where(eq(evalRuns.routeId, routeId))
    .orderBy(desc(evalRuns.createdAt));

  const completed = runs.filter(
    (run): run is (typeof runs)[number] & { avgScore: number } =>
      run.status === "completed" &&
      run.avgScore != null &&
      run.planId === evidencePlan.id &&
      run.examplesPlanned > 0 &&
      run.examplesFailed === 0 &&
      run.examplesScored === run.examplesPlanned,
  );
  // latest completed eval per model
  const latest = new Map<string, (typeof completed)[number]>();
  for (const r of completed) if (!latest.has(r.modelRef)) latest.set(r.modelRef, r);

  const liveModel = route.liveModel;
  const liveRun = liveModel ? latest.get(liveModel) : undefined;
  const liveCost = liveModel ? (costPer1kCents(liveModel) ?? COST_UNKNOWN) : COST_UNKNOWN;
  // A swap needs a baseline measured under the exact same authorization and golden sample.
  if (!liveModel || !liveRun) return null;
  if (mode === "cost" && liveCost === COST_UNKNOWN) return null;

  // "cost": cheapest passing candidate cheaper than live (optimize spend).
  // "drift": highest-scoring passing candidate regardless of cost (recover quality).
  let best: (typeof completed)[number] | null = null;
  let bestCost = mode === "cost" ? liveCost : COST_UNKNOWN;
  let bestScore = -1;
  for (const r of latest.values()) {
    if (r.modelRef === liveModel) continue;
    if (r.avgScore < minScore) continue;
    const cost = costPer1kCents(r.modelRef) ?? COST_UNKNOWN;
    if (mode === "cost") {
      if (cost < bestCost) {
        best = r;
        bestCost = cost;
      }
    } else if (r.avgScore > bestScore || (r.avgScore === bestScore && cost < bestCost)) {
      best = r;
      bestScore = r.avgScore;
      bestCost = cost;
    }
  }
  if (!best) return null;

  const costsComparable = liveCost !== COST_UNKNOWN && bestCost !== COST_UNKNOWN;
  const costDeltaPct = costsComparable ? ((bestCost - liveCost) / liveCost) * 100 : null;
  const resultRows = await db
    .select()
    .from(evalExampleResults)
    .where(eq(evalExampleResults.evalRunId, best.id));
  const liveResultRows = liveRun
    ? await db
        .select()
        .from(evalExampleResults)
        .where(eq(evalExampleResults.evalRunId, liveRun.id))
    : [];
  const candidateEvidenceComplete =
    resultRows.length === best.examplesPlanned &&
    resultRows.every(
      (result) =>
        result.error == null &&
        result.score != null &&
        result.candidateOutput != null &&
        result.perCriterionJson.length > 0,
    );
  const liveEvidenceComplete =
    liveResultRows.length === liveRun.examplesPlanned &&
    liveResultRows.every(
      (result) =>
        result.error == null &&
        result.score != null &&
        result.candidateOutput != null &&
        result.perCriterionJson.length > 0,
    );
  if (!candidateEvidenceComplete || !liveEvidenceComplete) return null;
  const liveByExample = new Map(
    liveResultRows.map((result) => [result.goldenExampleId, result]),
  );
  const criterionTotals = new Map<string, { sum: number; count: number }>();
  const liveCriterionTotals = new Map<string, { sum: number; count: number }>();
  for (const result of resultRows) {
    for (const item of result.perCriterionJson) {
      const aggregate = criterionTotals.get(item.criterion) ?? { sum: 0, count: 0 };
      aggregate.sum += item.score;
      aggregate.count += 1;
      criterionTotals.set(item.criterion, aggregate);
    }
  }
  for (const result of liveResultRows) {
    for (const item of result.perCriterionJson) {
      const aggregate = liveCriterionTotals.get(item.criterion) ?? { sum: 0, count: 0 };
      aggregate.sum += item.score;
      aggregate.count += 1;
      liveCriterionTotals.set(item.criterion, aggregate);
    }
  }
  const samples = resultRows
    .filter(
      (result) =>
        result.candidateOutput != null &&
        liveByExample.get(result.goldenExampleId)?.candidateOutput != null,
    )
    .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
    .slice(0, 3)
    .map((result) => ({
      input: result.input,
      fromOutput: liveByExample.get(result.goldenExampleId)!.candidateOutput!,
      toOutput: result.candidateOutput!,
    }));
  if (criterionTotals.size === 0 || liveCriterionTotals.size === 0 || samples.length === 0) {
    return null;
  }
  const evidence: Evidence = {
    fromModel: liveModel,
    toModel: best.modelRef,
    fromScore: liveRun?.avgScore ?? null,
    toScore: best.avgScore,
    costDeltaPct,
    latencyDeltaMs:
      liveRun && best.latencyMs != null && liveRun.latencyMs != null
        ? best.latencyMs - liveRun.latencyMs
        : null,
    perCriterion: [...criterionTotals.entries()].map(([criterion, aggregate]) => {
      const from = liveCriterionTotals.get(criterion);
      return {
        criterion,
        from: from ? from.sum / from.count : null,
        to: aggregate.sum / aggregate.count,
      };
    }),
    samples,
  };

  // Don't stack duplicate pending recs for the same target. This check happens only after
  // the new plan has independently satisfied the complete-evidence boundary above.
  const dupe = (
    await db
      .select()
      .from(recommendations)
      .where(
        and(
          eq(recommendations.routeId, routeId),
          eq(recommendations.status, "pending"),
          eq(recommendations.toModel, best.modelRef),
        ),
      )
      .limit(1)
  )[0];
  if (dupe) return dupe;

  // Per-route auto-approve (default OFF, PRD §3): "within band AND cost decreases".
  // In "cost" mode the candidate is always cheaper by construction, but "drift" mode
  // picks the highest-scoring passing model regardless of price — which could be MORE
  // expensive. Cost guard (FMEA P2): never auto-switch to a pricier model. If recovery
  // needs a costlier model, fall back to a pending recommendation for human approval.
  const autoApprove = route.autoApprove && costDeltaPct != null && costDeltaPct < 0;
  const rec = await db.transaction(async (tx) => {
    const currentRoute = (
      await tx
        .select({ liveModel: routes.liveModel })
        .from(routes)
        .where(eq(routes.id, routeId))
        .limit(1)
        .for("update")
    )[0];
    if (!currentRoute || currentRoute.liveModel !== liveModel) {
      throw new Error("route live model changed while recommendation evidence was prepared");
    }
    const created = (
      await tx
        .insert(recommendations)
        .values({
          routeId,
          fromModel: liveModel,
          toModel: best.modelRef,
          evidenceJson: evidence,
          status: autoApprove ? "approved" : "pending",
        })
        .returning()
    )[0]!;
    if (autoApprove) {
      await tx.update(routes).set({ liveModel: best.modelRef }).where(eq(routes.id, routeId));
    }
    return created;
  });
  return rec;
}

/** One recommendation scoped to a project (ownership check), or null. */
async function getOwnedRec(id: string, projectId: string) {
  const rows = await getDb()
    .select({ rec: getTableColumns(recommendations), projectId: routes.projectId })
    .from(recommendations)
    .innerJoin(routes, eq(recommendations.routeId, routes.id))
    .where(eq(recommendations.id, id))
    .limit(1);
  const row = rows[0];
  if (!row || row.projectId !== projectId) return null;
  return row.rec;
}

/**
 * Approve → the route's live model switches to the recommended model (PRD §3).
 * FMEA P2: the status flip and the live-model swap run in ONE transaction, so we can
 * never end up "approved" with the old live model still routing (or vice-versa).
 */
export async function approveRecommendation(id: string, projectId: string) {
  const db = getDb();
  const rec = await getOwnedRec(id, projectId);
  if (!rec) throw new Error("recommendation not found");
  if (rec.status !== "pending") throw new Error(`recommendation already ${rec.status}`);
  await db.transaction(async (tx) => {
    // re-check status inside the tx to close the approve/approve race
    const current = (
      await tx
        .select({
          status: recommendations.status,
          fromModel: recommendations.fromModel,
          toModel: recommendations.toModel,
          routeId: recommendations.routeId,
        })
        .from(recommendations)
        .where(eq(recommendations.id, id))
        .limit(1)
        .for("update")
    )[0];
    if (!current || current.status !== "pending") {
      throw new Error(`recommendation already ${current?.status ?? "gone"}`);
    }
    const currentRoute = (
      await tx
        .select({ liveModel: routes.liveModel, projectId: routes.projectId })
        .from(routes)
        .where(eq(routes.id, current.routeId))
        .limit(1)
        .for("update")
    )[0];
    if (!currentRoute || currentRoute.projectId !== projectId) {
      throw new Error("recommendation not found");
    }
    if (currentRoute.liveModel !== current.fromModel) {
      throw new Error("route live model changed; run a new comparable eval before approval");
    }
    await tx
      .update(recommendations)
      .set({ status: "approved" })
      .where(eq(recommendations.id, id));
    await tx.update(routes).set({ liveModel: current.toModel }).where(eq(routes.id, current.routeId));
  });
  return { ...rec, status: "approved" as const };
}

/** Reject → dismissed; the reason tunes future recommendations (PRD §3). */
export async function rejectRecommendation(id: string, projectId: string, reason?: string) {
  const db = getDb();
  const rec = await getOwnedRec(id, projectId);
  if (!rec) throw new Error("recommendation not found");
  if (rec.status !== "pending") throw new Error(`recommendation already ${rec.status}`);
  await db.transaction(async (tx) => {
    const current = (
      await tx
        .select({ status: recommendations.status })
        .from(recommendations)
        .where(eq(recommendations.id, id))
        .limit(1)
        .for("update")
    )[0];
    if (!current || current.status !== "pending") {
      throw new Error(`recommendation already ${current?.status ?? "gone"}`);
    }
    await tx
      .update(recommendations)
      .set({ status: "rejected", reason: reason ?? null })
      .where(eq(recommendations.id, id));
  });
  return { ...rec, status: "rejected" as const, reason: reason ?? null };
}

/** The Approvals inbox for a project (optionally filtered by status; paginated). */
export async function listRecommendations(opts: {
  projectId: string;
  status?: "pending" | "approved" | "rejected";
  limit?: string | number;
  offset?: string | number;
}) {
  const { limit, offset } = clampPagination(opts.limit, opts.offset);
  const where = opts.status
    ? and(eq(routes.projectId, opts.projectId), eq(recommendations.status, opts.status))
    : eq(routes.projectId, opts.projectId);
  return getDb()
    .select({ ...getTableColumns(recommendations), routeName: routes.name })
    .from(recommendations)
    .innerJoin(routes, eq(recommendations.routeId, routes.id))
    .where(where)
    .orderBy(desc(recommendations.createdAt))
    .limit(limit)
    .offset(offset);
}
