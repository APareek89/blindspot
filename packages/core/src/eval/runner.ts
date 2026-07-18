import { and, desc, eq, inArray } from "drizzle-orm";
import {
  evalExampleResults,
  evalPlans,
  evalRuns,
  getDb,
  goldenSets,
  routes,
} from "@blindspot/db";
import {
  costPer1kCents,
  normalizeModelRef,
  parseModelRef,
  runChat,
  type RunResult,
} from "@blindspot/providers";
import { DEFAULT_JUDGE_MODEL, type EvalPlannedExample } from "@blindspot/shared";
import { listExamples } from "../golden/service";
import { getProviderKey } from "../keys";
import { CANDIDATE_MAX_OUTPUT_TOKENS } from "./cost";
import { judgeOutputDetailed, type JudgeResult } from "./judge";

export interface EvalJob {
  projectId: string;
  routeId: string;
  modelRef: string;
  goldenSetVersion?: number;
  judgeModel?: string;
  evalPlanId?: string;
  exampleIds?: string[];
  exampleSnapshots?: EvalPlannedExample[];
  maxCostCents?: number;
  estimatedCostCentsByExample?: Record<string, number>;
  sampleSeed?: string;
}

export interface EvalRuntime {
  runCandidate(opts: { modelRef: string; input: string }): Promise<RunResult>;
  judge(opts: {
    modelRef: string;
    input: string;
    referenceOutput: string | null;
    rubric: string | null;
    output: string;
  }): Promise<JudgeResult>;
}

export interface EvalResult {
  evalRunId: string;
  modelRef: string;
  goldenSetVersion: number;
  avgScore: number;
  examples: number;
  failedExamples: number;
  actualCostCents: number;
}

async function defaultRuntime(projectId: string, modelRef: string, judgeModel: string) {
  const candidateKey = await getProviderKey(projectId, parseModelRef(modelRef).provider);
  if (!candidateKey) throw new Error(`no ${parseModelRef(modelRef).provider} key configured`);
  const judgeKey = await getProviderKey(projectId, parseModelRef(judgeModel).provider);
  if (!judgeKey) throw new Error(`no key configured for judge ${judgeModel}`);
  return {
    runCandidate: ({ input }: { modelRef: string; input: string }) =>
      runChat({
        modelRef,
        apiKey: candidateKey,
        messages: [{ role: "user", content: input }],
        maxTokens: CANDIDATE_MAX_OUTPUT_TOKENS,
      }),
    judge: (opts: {
      modelRef: string;
      input: string;
      referenceOutput: string | null;
      rubric: string | null;
      output: string;
    }) => judgeOutputDetailed({ ...opts, apiKey: judgeKey }),
  } satisfies EvalRuntime;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "eval example failed";
  return message
    .replace(/\b(?:sk-(?:ant-)?|gsk_)[A-Za-z0-9_-]{8,}\b/g, "[redacted-key]")
    .replace(/\bAIza[A-Za-z0-9_-]{12,}\b/g, "[redacted-key]")
    .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/((?:authorization|api[-_ ]?key)["':=\s]+)(?:bearer\s+)?[^\s,;]+/gi, "$1[redacted]")
    .slice(0, 500);
}

/** Run one model over the exact examples authorized by an eval plan and persist every result. */
export async function runEval(job: EvalJob, injectedRuntime?: EvalRuntime): Promise<EvalResult> {
  const db = getDb();
  if (!job.evalPlanId) {
    throw new Error("eval plan authorization is required before provider calls");
  }
  const authorizedPlan = (
    await db
      .select()
      .from(evalPlans)
      .where(and(eq(evalPlans.id, job.evalPlanId), eq(evalPlans.projectId, job.projectId)))
      .limit(1)
  )[0];
  if (
    !authorizedPlan ||
    authorizedPlan.routeId !== job.routeId ||
    authorizedPlan.status !== "running" ||
    !authorizedPlan.modelRefsJson.includes(job.modelRef)
  ) {
    throw new Error("eval plan is not authorized for this route and model");
  }
  const requestedExampleIds =
    job.exampleIds ?? job.exampleSnapshots?.map((example) => example.id) ?? [];
  if (
    requestedExampleIds.length !== authorizedPlan.disclosureJson.selectedExampleIds.length ||
    requestedExampleIds.some(
      (id, index) => id !== authorizedPlan.disclosureJson.selectedExampleIds[index],
    )
  ) {
    throw new Error("eval examples do not match the authorized plan");
  }
  const [route, sets] = await Promise.all([
    db.select().from(routes).where(eq(routes.id, job.routeId)).limit(1).then((rows) => rows[0]),
    db
      .select()
      .from(goldenSets)
      .where(eq(goldenSets.routeId, job.routeId))
      .orderBy(desc(goldenSets.version)),
  ]);
  if (!route || route.projectId !== job.projectId) throw new Error("route not found");
  const goldenSet = job.goldenSetVersion
    ? sets.find((set) => set.version === job.goldenSetVersion)
    : sets[0];
  if (!goldenSet) throw new Error("route has no golden set");

  let examples: Array<EvalPlannedExample & { goldenSetId: string }> = job.exampleSnapshots
    ? job.exampleSnapshots.map((example) => ({ ...example, goldenSetId: goldenSet.id }))
    : (await listExamples(goldenSet.id))
        .filter((example) => example.active)
        .map((example) => ({
          id: example.id,
          goldenSetId: example.goldenSetId,
          input: example.input,
          referenceOutput: example.referenceOutput,
          rubric: example.rubric,
          label: example.label,
          active: true as const,
        }));
  if (job.exampleIds && !job.exampleSnapshots) {
    const allowed = new Set(job.exampleIds);
    examples = examples
      .filter((example) => allowed.has(example.id))
      .sort((a, b) => job.exampleIds!.indexOf(a.id) - job.exampleIds!.indexOf(b.id));
    if (examples.length !== job.exampleIds.length) {
      throw new Error("one or more authorized golden examples are missing or inactive");
    }
  }
  if (examples.length === 0) throw new Error("golden set has no active examples");

  const judgeModel = normalizeModelRef(
    job.judgeModel ?? process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL,
  );
  const runtime = injectedRuntime ?? (await defaultRuntime(job.projectId, job.modelRef, judgeModel));
  const fallbackCapUsd = Number(process.env.COST_CAP_USD_PER_EVAL_RUN ?? 0);
  const requestedMaxCostCents =
    job.maxCostCents ??
    (fallbackCapUsd > 0 ? fallbackCapUsd * 100 : Number.POSITIVE_INFINITY);
  const authorizedModelCostCents = Object.values(
    authorizedPlan.disclosureJson.perModelExampleCostCents[job.modelRef] ?? {},
  ).reduce((sum, value) => sum + value, 0);
  const maxCostCents = Math.min(requestedMaxCostCents, authorizedModelCostCents);
  const estimatedCostCents = examples.reduce(
    (sum, example) => sum + (job.estimatedCostCentsByExample?.[example.id] ?? 0),
    0,
  );
  const run = (
    await db
      .insert(evalRuns)
      .values({
        routeId: job.routeId,
        planId: job.evalPlanId,
        modelRef: job.modelRef,
        goldenSetVersion: goldenSet.version,
        status: "running",
        avgScore: null,
        examplesPlanned: examples.length,
        estimatedCostCents: estimatedCostCents || null,
        sampleSeed: job.sampleSeed,
      })
      .returning()
  )[0]!;

  let scoreSum = 0;
  let latencySum = 0;
  let actualCostCents = 0;
  let scored = 0;
  let failed = 0;

  try {
    for (const example of examples) {
      const plannedCost = job.estimatedCostCentsByExample?.[example.id] ?? 0;
      if (actualCostCents + plannedCost > maxCostCents) {
        throw new Error("Authorized budget would be exceeded before the next example");
      }
      let candidate: RunResult | null = null;
      let judge: JudgeResult | null = null;
      try {
        candidate = await runtime.runCandidate({ modelRef: job.modelRef, input: example.input });
        judge = await runtime.judge({
          modelRef: judgeModel,
          input: example.input,
          referenceOutput: example.referenceOutput,
          rubric: example.rubric,
          output: candidate.text,
        });
        const candidateCost = candidate.costCents ?? 0;
        const judgeCost = judge.costCents ?? 0;
        actualCostCents += candidateCost + judgeCost;
        const issues = [
          ...(judge.verdict.score < route.policyJson.minScore ? ["score_below_quality_bar"] : []),
          ...judge.verdict.perCriterion
            .filter((criterion) => criterion.score < route.policyJson.minScore)
            .map((criterion) => `criterion_below_bar:${criterion.criterion}`),
        ];
        await db.insert(evalExampleResults).values({
          evalRunId: run.id,
          goldenExampleId: example.id,
          input: example.input,
          referenceOutput: example.referenceOutput,
          candidateOutput: candidate.text,
          score: judge.verdict.score,
          perCriterionJson: judge.verdict.perCriterion,
          reasoning: judge.verdict.reasoning,
          issuesJson: issues,
          latencyMs: candidate.latencyMs,
          candidateCostCents: candidateCost,
          judgeCostCents: judgeCost,
        });
        scoreSum += judge.verdict.score;
        latencySum += candidate.latencyMs;
        scored += 1;
      } catch (error) {
        const candidateCost = candidate?.costCents ?? 0;
        const judgeCost = judge?.costCents ?? 0;
        actualCostCents += candidateCost + judgeCost;
        failed += 1;
        await db.insert(evalExampleResults).values({
          evalRunId: run.id,
          goldenExampleId: example.id,
          input: example.input,
          referenceOutput: example.referenceOutput,
          candidateOutput: candidate?.text,
          perCriterionJson: [],
          issuesJson: ["example_execution_failed"],
          latencyMs: candidate?.latencyMs,
          candidateCostCents: candidateCost,
          judgeCostCents: judgeCost,
          error: safeError(error),
        });
      }
      if (actualCostCents > maxCostCents) {
        throw new Error("Actual provider usage exceeded the authorized budget");
      }
    }

    if (scored === 0) throw new Error("all eval examples failed (no scores)");
    const avgScore = scoreSum / scored;
    await db
      .update(evalRuns)
      .set({
        status: "completed",
        avgScore,
        costPer1k: costPer1kCents(job.modelRef),
        latencyMs: Math.round(latencySum / scored),
        examplesScored: scored,
        examplesFailed: failed,
        actualCostCents,
      })
      .where(eq(evalRuns.id, run.id));
    return {
      evalRunId: run.id,
      modelRef: job.modelRef,
      goldenSetVersion: goldenSet.version,
      avgScore,
      examples: scored,
      failedExamples: failed,
      actualCostCents,
    };
  } catch (error) {
    await db
      .update(evalRuns)
      .set({
        status: "failed",
        examplesScored: scored,
        examplesFailed: failed,
        actualCostCents,
      })
      .where(eq(evalRuns.id, run.id));
    throw error;
  }
}

export async function listEvalRunEvidence(projectId: string, routeId: string, limit = 10) {
  const runs = await getDb()
    .select()
    .from(evalRuns)
    .innerJoin(routes, eq(evalRuns.routeId, routes.id))
    .where(and(eq(routes.projectId, projectId), eq(evalRuns.routeId, routeId)))
    .orderBy(desc(evalRuns.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
  const runRows = runs.map((row) => row.eval_runs);
  if (runRows.length === 0) return [];
  const evidence = await getDb()
    .select()
    .from(evalExampleResults)
    .where(inArray(evalExampleResults.evalRunId, runRows.map((run) => run.id)));
  return runRows.map((run) => ({
    ...run,
    examples: evidence
      .filter((item) => item.evalRunId === run.id)
      .sort((a, b) => (a.score ?? -1) - (b.score ?? -1)),
  }));
}
