import { and, desc, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import {
  evalExampleResults,
  evalPlans,
  evalRuns,
  getDb,
  goldenExamples,
  goldenSets,
  routes,
} from "@blindspot/db";
import {
  costPer1kCents,
  estimateCostCents,
  normalizeModelRef,
  parseModelRef,
  runChat,
  type RunResult,
} from "@blindspot/providers";
import {
  DEFAULT_JUDGE_MODEL,
  WorkflowReplayResponseSchema,
  type EvalPlannedExample,
} from "@blindspot/shared";
import { listExamples } from "../golden/service";
import { getProviderKey } from "../keys";
import { getRouteReplayTarget } from "../workflows";
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
  executionMode?: "model_only" | "workflow_replay";
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

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0]!;
  if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7));
  if (isIP(normalized) === 4) {
    const [a = 0, b = 0] = normalized.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIP(normalized) === 6) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized)
    );
  }
  return true;
}

async function assertSafeReplayTarget(rawUrl: string): Promise<{
  url: URL;
  address: string;
  family: 4 | 6;
}> {
  const url = new URL(rawUrl);
  const local =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1" ||
    url.hostname === "[::1]";
  if (url.username || url.password || url.hash) {
    throw new Error("workflow replay URL cannot contain credentials or a fragment");
  }
  if (local) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("localhost workflow replay is disabled in production");
    }
  }
  if (!local && url.protocol !== "https:") throw new Error("workflow replay requires HTTPS");

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    (!local && addresses.some(({ address }) => isPrivateAddress(address)))
  ) {
    throw new Error("workflow replay target must resolve only to public addresses");
  }
  const chosen = addresses[0]!;
  return { url, address: chosen.address, family: chosen.family as 4 | 6 };
}

function postWorkflowReplay(
  target: Awaited<ReturnType<typeof assertSafeReplayTarget>>,
  headers: Record<string, string>,
  body: string,
  signal: AbortSignal,
): Promise<{ status: number; raw: string }> {
  return new Promise((resolve, reject) => {
    const transport = target.url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = transport(
      target.url,
      {
        method: "POST",
        headers: {
          ...headers,
          "content-length": String(Buffer.byteLength(body, "utf8")),
        },
        signal,
        // Pin the already-validated address. Re-resolving inside the HTTP client would leave a
        // DNS-rebinding window where the hostname could change to a private metadata address.
        lookup: (_hostname, _options, callback) => {
          callback(null, target.address, target.family);
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > 2_000_000) {
            request.destroy(new Error("workflow replay response exceeded 2 MB"));
            return;
          }
          chunks.push(buffer);
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            raw: Buffer.concat(chunks).toString("utf8"),
          });
        });
        response.on("error", reject);
      },
    );
    request.on("error", reject);
    request.end(body);
  });
}

async function runWorkflowReplay(
  target: NonNullable<Awaited<ReturnType<typeof getRouteReplayTarget>>>,
  modelRef: string,
  input: string,
): Promise<RunResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  timeout.unref?.();
  try {
    const safeTarget = await assertSafeReplayTarget(target.url);
    const payload = JSON.stringify({
      workflow: target.workflowName,
      environment: target.environment,
      route: target.routeName,
      node: target.nodeName,
      modelRef,
      input,
    });
    const response = await postWorkflowReplay(
      safeTarget,
      {
        authorization: `Bearer ${target.secret}`,
        "content-type": "application/json",
        "x-blindspot-replay": "1",
      },
      payload,
      controller.signal,
    );
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`workflow replay returned ${response.status}`);
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(response.raw);
    } catch {
      throw new Error("workflow replay returned invalid JSON");
    }
    const parsed = WorkflowReplayResponseSchema.safeParse(decoded);
    if (!parsed.success) {
      throw new Error(`workflow replay response is invalid: ${parsed.error.issues[0]?.message}`);
    }
    const result = parsed.data;
    return {
      text: result.output,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      latencyMs: result.latencyMs ?? Date.now() - startedAt,
      costCents:
        result.costCents ??
        estimateCostCents(modelRef, result.promptTokens, result.completionTokens),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function defaultRuntime(
  projectId: string,
  routeId: string,
  modelRef: string,
  judgeModel: string,
  executionMode: "model_only" | "workflow_replay",
) {
  const judgeKey = await getProviderKey(projectId, parseModelRef(judgeModel).provider);
  if (!judgeKey) throw new Error(`no key configured for judge ${judgeModel}`);
  const replayTarget =
    executionMode === "workflow_replay"
      ? await getRouteReplayTarget(projectId, routeId)
      : null;
  if (executionMode === "workflow_replay" && !replayTarget) {
    throw new Error("workflow replay is not configured for this route");
  }
  const candidateKey =
    executionMode === "model_only"
      ? await getProviderKey(projectId, parseModelRef(modelRef).provider)
      : null;
  if (executionMode === "model_only" && !candidateKey) {
    throw new Error(`no ${parseModelRef(modelRef).provider} key configured`);
  }
  return {
    runCandidate: ({ input }: { modelRef: string; input: string }) =>
      replayTarget
        ? runWorkflowReplay(replayTarget, modelRef, input)
        : runChat({
            modelRef,
            apiKey: candidateKey!,
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
    !authorizedPlan.modelRefsJson.includes(job.modelRef) ||
    authorizedPlan.executionMode !== (job.executionMode ?? "model_only")
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
  const executionMode = job.executionMode ?? "model_only";
  const runtime =
    injectedRuntime ??
    (await defaultRuntime(job.projectId, job.routeId, job.modelRef, judgeModel, executionMode));
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
        executionMode: job.executionMode ?? "model_only",
        scoreMethod: "legacy_judge_overall",
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
  let usedLegacyOverall = false;

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
        const score =
          judge.verdict.perCriterion.length > 0
            ? judge.verdict.perCriterion.reduce((sum, criterion) => sum + criterion.score, 0) /
              judge.verdict.perCriterion.length
            : judge.verdict.score;
        if (judge.verdict.perCriterion.length === 0) usedLegacyOverall = true;
        const issues = [
          ...(score < route.policyJson.minScore ? ["score_below_quality_bar"] : []),
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
          score,
          perCriterionJson: judge.verdict.perCriterion,
          reasoning: judge.verdict.reasoning,
          issuesJson: issues,
          latencyMs: candidate.latencyMs,
          candidateCostCents: candidateCost,
          judgeCostCents: judgeCost,
        });
        scoreSum += score;
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
        scoreMethod: usedLegacyOverall ? "legacy_judge_overall" : "criteria_mean",
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
    .where(
      and(
        eq(routes.projectId, projectId),
        eq(evalRuns.routeId, routeId),
        isNotNull(evalRuns.planId),
        gt(evalRuns.examplesPlanned, 0),
      ),
    )
    .orderBy(desc(evalRuns.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
  const runRows = runs.map((row) => row.eval_runs);
  if (runRows.length === 0) return [];
  const evidence = await getDb()
    .select()
    .from(evalExampleResults)
    .where(inArray(evalExampleResults.evalRunId, runRows.map((run) => run.id)));
  const exampleIds = evidence
    .map((item) => item.goldenExampleId)
    .filter((id): id is string => id != null);
  const labels =
    exampleIds.length > 0
      ? await getDb()
          .select({ id: goldenExamples.id, label: goldenExamples.label })
          .from(goldenExamples)
          .where(inArray(goldenExamples.id, exampleIds))
      : [];
  const labelById = new Map(labels.map((item) => [item.id, item.label]));
  return runRows.map((run) => ({
    ...run,
    examples: evidence
      .filter((item) => item.evalRunId === run.id)
      .sort((a, b) => (a.score ?? -1) - (b.score ?? -1))
      .map((item) => ({
        ...item,
        label: item.goldenExampleId
          ? (labelById.get(item.goldenExampleId) ?? "unlabeled")
          : "unlabeled",
      })),
  }));
}
