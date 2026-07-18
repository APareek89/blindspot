import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  candidates,
  evalRuns,
  evalPlans,
  getDb,
  goldenExamples,
  goldenSets,
  routes,
} from "@blindspot/db";
import { normalizeModelRef } from "@blindspot/providers";
import {
  DEFAULT_JUDGE_MODEL,
  EvalPlanDisclosureSchema,
  type EvalPlanCreateInput,
  type EvalPlannedExample,
  type EvalSampleStratum,
} from "@blindspot/shared";
import { getRouteModelCompatibility } from "../model-registry";
import { generateRecommendation } from "../recommend";
import { getOwnedRoute } from "../routes/service";
import { evalExecutionMode } from "./queue";
import {
  EVAL_ESTIMATE_SAFETY_METHOD,
  estimateExampleModelCostCents,
  type CostableGoldenExample,
} from "./cost";
import { runEval } from "./runner";

const PLAN_TTL_MS = 30 * 60 * 1000;
const EDGE_WORD = /\b(edge|adversarial|ambiguous|invalid|empty|long|unicode|failure|error)\b/i;

export class EvalBudgetTooLowError extends Error {
  constructor(
    public readonly minimumBudgetCents: number,
    public readonly fullEstimatedCostCents: number,
  ) {
    super(`Budget is too low for one disclosed example; minimum is $${(minimumBudgetCents / 100).toFixed(4)}`);
    this.name = "EvalBudgetTooLowError";
  }
}

export class EvalPlanStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvalPlanStateError";
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safePlanFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "eval plan failed";
  return message
    .replace(/\b(?:sk-(?:ant-)?|gsk_)[A-Za-z0-9_-]{8,}\b/g, "[redacted-key]")
    .replace(/\bAIza[A-Za-z0-9_-]{12,}\b/g, "[redacted-key]")
    .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/((?:authorization|api[-_ ]?key)["':=\s]+)(?:bearer\s+)?[^\s,;]+/gi, "$1[redacted]")
    .slice(0, 500);
}

function contentHash(
  examples: Array<Omit<EvalPlannedExample, "active"> & { active: boolean }>,
): string {
  return digest(
    JSON.stringify(
      [...examples]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((example) => [
          example.id,
          example.input,
          example.referenceOutput,
          example.rubric,
          example.label,
          example.active,
        ]),
    ),
  );
}

function stableOrder<T extends { id: string }>(items: T[], seed: string): T[] {
  return [...items].sort((a, b) =>
    digest(`${seed}:${a.id}`).localeCompare(digest(`${seed}:${b.id}`)),
  );
}

function classifyExamples(
  examples: Array<CostableGoldenExample & { label: "pass" | "fail" | "unlabeled" }>,
) {
  const sortedLengths = examples.map((example) => example.input.length).sort((a, b) => a - b);
  const longThreshold = sortedLengths[Math.max(0, Math.floor(sortedLengths.length * 0.75))] ?? 0;
  return new Map<string, EvalSampleStratum>(
    examples.map((example) => {
      if (example.label === "pass") return [example.id, "must_pass"];
      if (example.label === "fail") return [example.id, "known_failure"];
      if (
        example.input.length >= longThreshold ||
        EDGE_WORD.test(`${example.input}\n${example.rubric ?? ""}`)
      ) {
        return [example.id, "edge"];
      }
      return [example.id, "representative"];
    }),
  );
}

function chooseSample(
  examples: Array<CostableGoldenExample & { label: "pass" | "fail" | "unlabeled" }>,
  totalCostByExample: Map<string, number>,
  budgetCents: number,
  seed: string,
) {
  const strata = classifyExamples(examples);
  const order: EvalSampleStratum[] = [
    "must_pass",
    "known_failure",
    "edge",
    "representative",
  ];
  const queues = new Map(
    order.map((stratum) => [
      stratum,
      stableOrder(
        examples.filter((example) => strata.get(example.id) === stratum),
        `${seed}:${stratum}`,
      ),
    ]),
  );
  const selected: typeof examples = [];
  const selectedIds = new Set<string>();
  let cost = 0;
  const tryAdd = (example: (typeof examples)[number] | undefined) => {
    if (!example || selectedIds.has(example.id)) return;
    const next = totalCostByExample.get(example.id) ?? Number.POSITIVE_INFINITY;
    if (cost + next > budgetCents) return;
    selected.push(example);
    selectedIds.add(example.id);
    cost += next;
  };

  // First preserve coverage across every available stratum. Then spend remaining budget on
  // must-pass/known failures, followed by edge and representative cases.
  for (const stratum of order) tryAdd(queues.get(stratum)?.[0]);
  for (const stratum of order) {
    for (const example of queues.get(stratum) ?? []) tryAdd(example);
  }
  return { selected, selectedCostCents: cost, strata };
}

async function assertModelsEligible(projectId: string, routeName: string, modelRefs: string[]) {
  const compatibility = await getRouteModelCompatibility(projectId, routeName);
  if (!compatibility) throw new Error("route not found");
  if (!compatibility.optimizationAllowed) {
    throw new Error(compatibility.optimizationBlockedReason ?? "workflow is observe-only");
  }
  const eligible = new Set(compatibility.eligible.map((model) => model.modelRef));
  const unsupported = modelRefs.filter((modelRef) => !eligible.has(modelRef));
  if (unsupported.length > 0) {
    throw new Error(`Models are not technically eligible: ${unsupported.join(", ")}`);
  }
  const route = await getOwnedRoute(projectId, routeName);
  if (!route) throw new Error("route not found");
  const rows = await getDb()
    .select({ modelRef: candidates.modelRef })
    .from(candidates)
    .where(and(eq(candidates.routeId, route.id), eq(candidates.enabled, true)));
  const pooled = new Set(rows.map((row) => row.modelRef));
  const missing = modelRefs.filter((modelRef) => !pooled.has(modelRef));
  if (missing.length > 0) throw new Error(`Add these models to the candidate pool first: ${missing.join(", ")}`);
  return route;
}

export async function createEvalPlan(
  projectId: string,
  routeName: string,
  input: EvalPlanCreateInput,
) {
  const modelRefs = [...new Set(input.modelRefs)].sort();
  const route = await assertModelsEligible(projectId, routeName, modelRefs);
  const goldenSet = (
    await getDb()
      .select()
      .from(goldenSets)
      .where(eq(goldenSets.routeId, route.id))
      .orderBy(desc(goldenSets.version))
      .limit(1)
  )[0];
  if (!goldenSet) throw new Error("route has no golden set");
  const examples = await getDb()
    .select()
    .from(goldenExamples)
    .where(and(eq(goldenExamples.goldenSetId, goldenSet.id), eq(goldenExamples.active, true)));
  if (examples.length === 0) throw new Error("golden set has no active examples");

  const judgeModel = normalizeModelRef(
    process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL,
  );
  const perModelExampleCostCents: Record<string, Record<string, number>> = {};
  const totalCostByExample = new Map<string, number>();
  const modelEstimates = modelRefs.map((modelRef) => {
    const costs: Record<string, number> = {};
    let estimatedCostCents = 0;
    for (const example of examples) {
      const cost = estimateExampleModelCostCents(example, modelRef, judgeModel);
      costs[example.id] = cost;
      estimatedCostCents += cost;
      totalCostByExample.set(example.id, (totalCostByExample.get(example.id) ?? 0) + cost);
    }
    perModelExampleCostCents[modelRef] = costs;
    return { modelRef, estimatedCostCents, calls: examples.length * 2 };
  });
  const fullEstimatedCostCents = [...totalCostByExample.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  const minimumBudgetCents = Math.min(...totalCostByExample.values());
  const budgetCents = input.budgetUsd * 100;
  if (budgetCents < minimumBudgetCents) {
    throw new EvalBudgetTooLowError(minimumBudgetCents, fullEstimatedCostCents);
  }

  const seed = digest(
    `${route.id}:${goldenSet.id}:${modelRefs.join(",")}:${budgetCents.toFixed(6)}`,
  ).slice(0, 16);
  const fullRun = budgetCents >= fullEstimatedCostCents;
  const chosen = fullRun
    ? {
        selected: stableOrder(examples, seed),
        selectedCostCents: fullEstimatedCostCents,
        strata: classifyExamples(examples),
      }
    : chooseSample(examples, totalCostByExample, budgetCents, seed);
  if (chosen.selected.length === 0) {
    throw new EvalBudgetTooLowError(minimumBudgetCents, fullEstimatedCostCents);
  }
  const strataSelected = {
    must_pass: 0,
    known_failure: 0,
    edge: 0,
    representative: 0,
  };
  for (const example of chosen.selected) strataSelected[chosen.strata.get(example.id)!] += 1;
  const strataAvailable = {
    must_pass: 0,
    known_failure: 0,
    edge: 0,
    representative: 0,
  };
  for (const example of examples) strataAvailable[chosen.strata.get(example.id)!] += 1;
  const selectedIds = new Set(chosen.selected.map((example) => example.id));

  const disclosure = EvalPlanDisclosureSchema.parse({
    mode: fullRun ? "full" : "sampled",
    models: modelRefs,
    judgeModel,
    goldenSetVersion: goldenSet.version,
    fullExampleCount: examples.length,
    selectedExampleIds: chosen.selected.map((example) => example.id),
    selectedExamples: chosen.selected.map((example) => ({
      id: example.id,
      input: example.input,
      referenceOutput: example.referenceOutput,
      rubric: example.rubric,
      label: example.label,
      active: true as const,
    })),
    omittedExamples: examples
      .filter((example) => !selectedIds.has(example.id))
      .map((example) => ({ id: example.id, input: example.input, label: example.label })),
    omittedExampleCount: examples.length - chosen.selected.length,
    strataSelected,
    strataAvailable,
    seed,
    budgetCents,
    fullEstimatedCostCents,
    selectedEstimatedCostCents: chosen.selectedCostCents,
    minimumBudgetCents,
    modelEstimates: modelEstimates.map((estimate) => ({
      ...estimate,
      estimatedCostCents: chosen.selected.reduce(
        (sum, example) => sum + perModelExampleCostCents[estimate.modelRef]![example.id]!,
        0,
      ),
      calls: chosen.selected.length * 2,
    })),
    perModelExampleCostCents: Object.fromEntries(
      modelRefs.map((modelRef) => [
        modelRef,
        Object.fromEntries(
          chosen.selected.map((example) => [
            example.id,
            perModelExampleCostCents[modelRef]![example.id]!,
          ]),
        ),
      ]),
    ),
    safetyMethod: EVAL_ESTIMATE_SAFETY_METHOD,
    confidenceNote:
      fullRun
        ? "All active golden examples are included. The estimate is deliberately conservative; provider-reported usage is persisted."
        : "A smaller disclosed sample reduces confidence versus the full set. The seed makes the same plan reproducible.",
  });
  const expiresAt = new Date(Date.now() + PLAN_TTL_MS);
  const plan = (
    await getDb()
      .insert(evalPlans)
      .values({
        projectId,
        routeId: route.id,
        goldenSetId: goldenSet.id,
        modelRefsJson: modelRefs,
        judgeModel,
        budgetCents,
        fullEstimatedCostCents,
        selectedEstimatedCostCents: chosen.selectedCostCents,
        sampleSeed: seed,
        selectionHash: contentHash(
          chosen.selected.map((example) => ({
            id: example.id,
            input: example.input,
            referenceOutput: example.referenceOutput,
            rubric: example.rubric,
            label: example.label,
            active: true as const,
          })),
        ),
        disclosureJson: disclosure,
        expiresAt,
      })
      .returning()
  )[0]!;
  return { ...plan, disclosure: plan.disclosureJson };
}

export async function getEvalPlan(projectId: string, planId: string) {
  const plan = (
    await getDb()
      .select()
      .from(evalPlans)
      .where(and(eq(evalPlans.id, planId), eq(evalPlans.projectId, projectId)))
      .limit(1)
  )[0];
  return plan ? { ...plan, disclosure: plan.disclosureJson } : null;
}

export async function runAuthorizedEvalPlan(
  projectId: string,
  planId: string,
  confirm: true,
  runtime?: Parameters<typeof runEval>[1],
) {
  if (confirm !== true) throw new EvalPlanStateError("Explicit confirmation is required");
  if (evalExecutionMode() !== "inline") {
    throw new EvalPlanStateError("Budgeted multi-model plans run inline locally until the Phase 8 worker handoff");
  }
  const existing = await getEvalPlan(projectId, planId);
  if (!existing) throw new EvalPlanStateError("eval plan not found");
  const route = (
    await getDb()
      .select()
      .from(routes)
      .where(and(eq(routes.id, existing.routeId), eq(routes.projectId, projectId)))
      .limit(1)
  )[0];
  if (!route) throw new EvalPlanStateError("route not found");
  await assertModelsEligible(projectId, route.name, existing.modelRefsJson);

  const examples = await getDb()
    .select()
    .from(goldenExamples)
    .where(inArray(goldenExamples.id, existing.disclosureJson.selectedExampleIds));
  if (
    examples.length !== existing.disclosureJson.selectedExampleIds.length ||
    contentHash(
      examples.map((example) => ({
        id: example.id,
        input: example.input,
        referenceOutput: example.referenceOutput,
        rubric: example.rubric,
        label: example.label,
            active: example.active ? (true as const) : (false as const),
      })),
    ) !== existing.selectionHash ||
    examples.some((example) => !example.active)
  ) {
    throw new EvalPlanStateError("Golden examples changed after the estimate; calculate a new plan");
  }

  const started = await getDb().transaction(async (tx) => {
    const current = (
      await tx
        .select()
        .from(evalPlans)
        .where(and(eq(evalPlans.id, planId), eq(evalPlans.projectId, projectId)))
        .limit(1)
        .for("update")
    )[0];
    if (!current) throw new EvalPlanStateError("eval plan not found");
    if (current.status !== "draft") {
      throw new EvalPlanStateError(`eval plan is already ${current.status}`);
    }
    if (current.expiresAt.getTime() <= Date.now()) {
      await tx.update(evalPlans).set({ status: "expired" }).where(eq(evalPlans.id, planId));
      return null;
    }
    return (
      await tx
        .update(evalPlans)
        .set({ status: "running", authorizedAt: new Date(), startedAt: new Date() })
        .where(eq(evalPlans.id, planId))
        .returning()
    )[0]!;
  });
  if (!started) throw new EvalPlanStateError("eval plan expired; calculate a new estimate");

  let actualCostCents = 0;
  const results: Awaited<ReturnType<typeof runEval>>[] = [];
  try {
    for (const modelRef of started.modelRefsJson) {
      const remaining = Math.max(0, started.budgetCents - actualCostCents);
      const result = await runEval(
        {
          projectId,
          routeId: started.routeId,
          modelRef,
          goldenSetVersion: existing.disclosureJson.goldenSetVersion,
          evalPlanId: started.id,
          exampleIds: existing.disclosureJson.selectedExampleIds,
          exampleSnapshots: existing.disclosureJson.selectedExamples,
          maxCostCents: remaining,
          estimatedCostCentsByExample:
            existing.disclosureJson.perModelExampleCostCents[modelRef] ?? {},
          sampleSeed: existing.sampleSeed,
        },
        runtime,
      );
      actualCostCents += result.actualCostCents;
      results.push(result);
    }
    const completed = (
      await getDb()
        .update(evalPlans)
        .set({ status: "completed", completedAt: new Date(), actualCostCents })
        .where(eq(evalPlans.id, planId))
        .returning()
    )[0]!;
    const allEvidenceComplete = results.every(
      (result) =>
        result.failedExamples === 0 &&
        result.examples === existing.disclosureJson.selectedExampleIds.length,
    );
    const recommendation = allEvidenceComplete
      ? await generateRecommendation(started.routeId, { planId: started.id })
      : null;
    return { plan: { ...completed, disclosure: completed.disclosureJson }, runs: results, recommendation };
  } catch (error) {
    const message = safePlanFailure(error);
    const observedRuns = await getDb()
      .select({ actualCostCents: evalRuns.actualCostCents })
      .from(evalRuns)
      .where(eq(evalRuns.planId, planId));
    actualCostCents = observedRuns.reduce(
      (sum, run) => sum + (run.actualCostCents ?? 0),
      0,
    );
    await getDb()
      .update(evalPlans)
      .set({ status: "failed", completedAt: new Date(), actualCostCents, failureReason: message })
      .where(eq(evalPlans.id, planId));
    throw error;
  }
}
