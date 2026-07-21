import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  apiKeys,
  candidates,
  driftEvents,
  evalExampleResults,
  evalPlans,
  evalRuns,
  getDb,
  modelRegistry,
  projects,
  recommendations,
  routes,
  traces,
  workflowExecutions,
  workflowNodes,
  workflowSpans,
  workflows,
} from "@blindspot/db";
import {
  checkDrift,
  createSignupInvite,
  createSignupProject,
  createInvitedProject,
  createEvalPlan,
  createGoldenSet,
  generateRecommendation,
  ingestWorkflowSpans,
  hashGatewayKey,
  listBetaFeedback,
  approveRecommendation,
  promoteTrace,
  runAuthorizedEvalPlan,
  setProviderKey,
  submitBetaFeedback,
  updateWorkflowReplayConfig,
  verifySignupInvite,
  type EvalRuntime,
} from "@blindspot/core";
import { Blindspot } from "@blindspot/sdk";
import { BetaFeedbackInputSchema, loadRootEnv, ModelCapabilitiesSchema } from "@blindspot/shared";

loadRootEnv(import.meta.url);

const SONNET = "anthropic:claude-sonnet-4-6";
const HAIKU = "anthropic:claude-haiku-4-5-20251001";

async function assertSdkExecutionBoundary() {
  const originalFetch = globalThis.fetch;
  const delivered: unknown[] = [];
  globalThis.fetch = async (_input, init) => {
    delivered.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ accepted: 1 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const client = new Blindspot({
      apiKey: "test-only-api-key",
      baseUrl: "http://blindspot.test",
      workflow: "sdk-lifecycle-test",
      environment: "test",
      flushIntervalMs: 60_000,
    });
    const executionId = "sdk-execution-boundary";
    await client.observeGeneration(
      {
        executionId,
        node: "child-generation",
        provider: "anthropic",
        model: "claude-haiku-test",
      },
      async () => "ok",
    );
    const root = client.span({
      id: executionId,
      executionId,
      node: "pipeline",
      kind: "agent",
    });
    root.end({ executionStatus: "completed", executionEndedAt: new Date() });
    await client.flush();

    const spans = delivered.flatMap((batch) =>
      ((batch as { spans?: Array<{ span: { node: string }; execution: { status?: string } }> })
        .spans ?? []),
    );
    assert.equal(
      spans.find((item) => item.span.node === "child-generation")?.execution.status,
      undefined,
      "ordinary child spans must not claim ownership of execution status",
    );
    assert.equal(
      spans.find((item) => item.span.node === "pipeline")?.execution.status,
      "completed",
      "the explicit request boundary must carry terminal execution status",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  await assertSdkExecutionBoundary();
  const db = getDb();
  const inviteOwner = `invite-test-${randomUUID()}@example.com`;
  const invited = await createInvitedProject({
    name: "Invite integration test",
    owner: inviteOwner,
  });
  try {
    const storedInviteKey = (
      await db
        .select({ keyHash: apiKeys.keyHash })
        .from(apiKeys)
        .where(eq(apiKeys.projectId, invited.project.id))
        .limit(1)
    )[0]!;
    assert.equal(storedInviteKey.keyHash, hashGatewayKey(invited.key));
    assert.equal("key" in storedInviteKey, false, "raw invite keys must never be stored");
    let duplicateInviteBlocked = false;
    try {
      await createInvitedProject({ name: "Invite integration test", owner: inviteOwner });
    } catch {
      duplicateInviteBlocked = true;
    }
    assert.equal(duplicateInviteBlocked, true, "duplicate beta projects must be rejected");
  } finally {
    await db.delete(projects).where(eq(projects.id, invited.project.id));
  }

  const signupOwner = `signup-test-${randomUUID()}@example.com`;
  const signupInvite = createSignupInvite({
    owner: signupOwner.toUpperCase(),
    project: "Signup integration test",
    expiresInSeconds: 60 * 60,
  });
  const verifiedSignupInvite = verifySignupInvite(signupInvite.token);
  assert.equal(verifiedSignupInvite.owner, signupOwner, "signup email must normalize before signing");
  const tamperedToken = `${signupInvite.token.slice(0, -1)}${signupInvite.token.endsWith("A") ? "B" : "A"}`;
  assert.throws(() => verifySignupInvite(tamperedToken), "tampered signup links must be rejected");
  const expiredInvite = createSignupInvite({
    owner: signupOwner,
    project: "Expired signup integration test",
    expiresInSeconds: 60 * 60,
    now: new Date(Date.now() - 2 * 60 * 60 * 1000),
  });
  assert.throws(() => verifySignupInvite(expiredInvite.token), "expired signup links must be rejected");

  const concurrentSignupAttempts = await Promise.all(
    Array.from({ length: 4 }, () => createSignupProject(signupInvite.token)),
  );
  const signedUp = concurrentSignupAttempts[0]!;
  try {
    assert.equal(
      new Set(concurrentSignupAttempts.map((result) => result.project.id)).size,
      1,
      "concurrent use of one signup link must create exactly one project",
    );
    assert.equal(
      concurrentSignupAttempts.filter((result) => !result.replayed).length,
      1,
      "exactly one concurrent signup request must own project creation",
    );
    assert.notEqual(signedUp.recoveryKey, signedUp.applicationKey, "human and app keys must differ");
    const replayedSignup = await createSignupProject(signupInvite.token);
    assert.equal(replayedSignup.replayed, true, "a lost signup response must be safely retryable");
    assert.equal(replayedSignup.project.id, signedUp.project.id, "a signup retry must reuse the project");
    assert.equal(replayedSignup.recoveryKey, signedUp.recoveryKey, "a signup retry must recover the same recovery key");
    assert.equal(replayedSignup.applicationKey, signedUp.applicationKey, "a signup retry must recover the same app key");
    await assert.rejects(
      () => createSignupProject(signupInvite.token, new Date(Date.now() + 6 * 60 * 1000)),
      "key recovery through an already-used invite must close after the lost-response window",
    );
    const storedSignupKeys = await db
      .select({ keyHash: apiKeys.keyHash })
      .from(apiKeys)
      .where(eq(apiKeys.projectId, signedUp.project.id));
    assert.equal(storedSignupKeys.length, 2, "signup must atomically create two keys");
    assert.deepEqual(
      new Set(storedSignupKeys.map((row) => row.keyHash)),
      new Set([hashGatewayKey(signedUp.recoveryKey), hashGatewayKey(signedUp.applicationKey)]),
      "signup must store only the two expected hashes",
    );
  } finally {
    await db.delete(projects).where(eq(projects.id, signedUp.project.id));
  }

  const project = (
    await db
      .insert(projects)
      .values({ userId: `eval-plan-test-${randomUUID()}`, name: "Eval plan integration test" })
      .returning()
  )[0]!;

  try {
    const feedback = await submitBetaFeedback(project.id, {
      stage: "connection",
      attempted: "Connected the hosted test application",
      expected: "A complete multi-node workflow trace",
      actual: "The test feedback path stored this report",
      impact: "minor",
      framework: "custom TypeScript",
      captureMode: "metadata",
      confirmSafe: true,
    });
    const feedbackHistory = await listBetaFeedback(project.id);
    assert.equal(feedbackHistory[0]?.id, feedback.id, "feedback must remain project-scoped");
    assert.equal(
      BetaFeedbackInputSchema.safeParse({
        stage: "connection",
        attempted: "I pasted this by mistake",
        expected: "The credential should be rejected",
        actual: ["bs", "live", "a".repeat(24)].join("_"),
        impact: "blocked",
        confirmSafe: true,
      }).success,
      false,
      "obvious credentials must be rejected before feedback storage",
    );

    const executionId = `ingest-lifecycle-${randomUUID()}`;
    const now = new Date();
    await ingestWorkflowSpans(project.id, [
      {
        workflow: {
          name: "ingest-lifecycle-test",
          environment: "test",
          integrationMode: "observe_only",
        },
        execution: {
          id: executionId,
          status: "completed",
          endedAt: now.toISOString(),
        },
        span: {
          id: executionId,
          node: "pipeline",
          kind: "agent",
          startedAt: new Date(now.getTime() - 10).toISOString(),
          endedAt: now.toISOString(),
          status: "ok",
          latencyMs: 10,
        },
        captureMode: "metadata",
      },
      {
        workflow: {
          name: "ingest-lifecycle-test",
          environment: "test",
          integrationMode: "observe_only",
        },
        execution: { id: executionId },
        span: {
          id: `${executionId}-child`,
          parentId: executionId,
          node: "intake",
          kind: "generation",
          provider: "anthropic",
          model: "claude-haiku-4-5-20251001",
          startedAt: new Date(now.getTime() - 8).toISOString(),
          endedAt: now.toISOString(),
          status: "ok",
          latencyMs: 8,
        },
        captureMode: "metadata",
      },
    ]);
    const lifecycleWorkflow = (
      await db
        .select({ id: workflows.id })
        .from(workflows)
        .where(eq(workflows.name, "ingest-lifecycle-test"))
        .limit(1)
    )[0]!;
    const lifecycleExecution = (
      await db
        .select({ id: workflowExecutions.id, status: workflowExecutions.status })
        .from(workflowExecutions)
        .where(eq(workflowExecutions.externalId, executionId))
        .limit(1)
    )[0]!;
    const lifecycleSpans = await db
      .select({ id: workflowSpans.id })
      .from(workflowSpans)
      .where(eq(workflowSpans.executionId, lifecycleExecution.id));
    assert.equal(lifecycleWorkflow.id.length > 0, true);
    assert.equal(lifecycleExecution.status, "completed", "a late child must not reopen execution");
    assert.equal(lifecycleSpans.length, 2, "root and child spans must both ingest");

    await setProviderKey(project.id, "anthropic", "test-only-provider-key");
    const capabilities = ModelCapabilitiesSchema.parse({
      inputModalities: ["text"],
      outputModalities: ["text"],
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
      systemMessages: true,
      contextTokens: 200_000,
      maxOutputTokens: 64_000,
    });
    await db.insert(modelRegistry).values([
      {
        projectId: project.id,
        provider: "anthropic",
        modelRef: SONNET,
        providerModelId: "claude-sonnet-4-6",
        displayName: "Claude Sonnet 4.6",
        availability: "available",
        capabilitiesJson: { ...capabilities, contextTokens: 1_000_000 },
        inputUsdPerMillion: 3,
        outputUsdPerMillion: 15,
        probeStatus: "verified",
      },
      {
        projectId: project.id,
        provider: "anthropic",
        modelRef: HAIKU,
        providerModelId: "claude-haiku-4-5-20251001",
        displayName: "Claude Haiku 4.5",
        availability: "available",
        capabilitiesJson: capabilities,
        inputUsdPerMillion: 1,
        outputUsdPerMillion: 5,
        probeStatus: "verified",
      },
    ]);

    const workflow = (
      await db
        .insert(workflows)
        .values({
          projectId: project.id,
          name: "gstpilot-test",
          environment: "local",
          selected: true,
          integrationMode: "managed",
        })
        .returning()
    )[0]!;
    const route = (
      await db
        .insert(routes)
        .values({
          projectId: project.id,
          name: "gstpilot-test@local:answer",
          liveModel: SONNET,
          policyJson: { type: "cheapest_passing", minScore: 0.85 },
          autoApprove: false,
        })
        .returning()
    )[0]!;
    await db.insert(workflowNodes).values({
      workflowId: workflow.id,
      routeId: route.id,
      name: "answer",
      kind: "generation",
      latestModel: SONNET,
      requirementsJson: {
        inputModalities: ["text"],
        outputModalities: ["text"],
        toolCalling: false,
        structuredOutput: false,
        streaming: false,
        systemMessages: false,
      },
    });
    await updateWorkflowReplayConfig(project.id, workflow.id, {
      url: "http://localhost:3999/api/blindspot/replay",
      secret: "test-only-replay-secret",
      enabled: true,
    });
    await db.insert(candidates).values([
      { routeId: route.id, modelRef: SONNET, source: "api", enabled: true },
      { routeId: route.id, modelRef: HAIKU, source: "api", enabled: true },
    ]);
    const goldenSet = await createGoldenSet({
      routeId: route.id,
      origin: "upload",
      examples: [
        {
          input: "Must-pass: summarize a ₹1,000 GST invoice into one sentence.",
          referenceOutput: "A ₹1,000 GST invoice was issued.",
          rubric: "Accurate amount and concise summary",
          label: "pass",
        },
        {
          input: "Known failure: explain an invoice with a missing GSTIN.",
          referenceOutput: "Flag the missing GSTIN and request correction.",
          rubric: "Must flag compliance risk",
          label: "fail",
        },
        {
          input: "Edge case: summarize a multilingual GST note with Unicode ₹ characters.",
          referenceOutput: "Summarize without corrupting Unicode currency symbols.",
          rubric: "Preserve Unicode and meaning",
          label: "unlabeled",
        },
        {
          input: "Summarize a standard purchase invoice.",
          referenceOutput: "A standard purchase invoice was received.",
          rubric: "Concise and accurate",
          label: "unlabeled",
        },
      ],
    });

    const otherRoute = (
      await db
        .insert(routes)
        .values({
          projectId: project.id,
          name: "gstpilot-test@local:other-node",
          liveModel: SONNET,
          policyJson: { type: "cheapest_passing", minScore: 0.85 },
        })
        .returning()
    )[0]!;
    const wrongRouteTrace = (
      await db
        .insert(traces)
        .values({
          routeId: otherRoute.id,
          model: SONNET,
          input: [{ role: "user", content: "A trace from another route" }],
          output: "Not valid evidence for this route",
        })
        .returning()
    )[0]!;
    await assert.rejects(
      promoteTrace({ goldenSetId: goldenSet.id, traceId: wrongRouteTrace.id }),
      /only a trace from this route/,
      "a project-owned trace must still match the target golden set's route",
    );

    // Legacy aggregate-only runs have no immutable plan or per-example evidence. They must
    // never be enough to create an approval, even if their aggregate scores look plausible.
    await db.insert(evalRuns).values([
      {
        routeId: route.id,
        modelRef: SONNET,
        goldenSetVersion: 1,
        avgScore: 0.93,
        examplesPlanned: 0,
        examplesScored: 0,
      },
      {
        routeId: route.id,
        modelRef: HAIKU,
        goldenSetVersion: 1,
        avgScore: 0.9,
        examplesPlanned: 0,
        examplesScored: 0,
      },
    ]);
    assert.equal(
      await generateRecommendation(route.id),
      null,
      "aggregate-only legacy runs must not create a recommendation",
    );

    const full = await createEvalPlan(project.id, route.name, {
      modelRefs: [SONNET, HAIKU],
      budgetUsd: 1,
      executionMode: "workflow_replay",
    });
    const sampledBudgetCents = Math.max(
      full.disclosure.minimumBudgetCents,
      full.disclosure.fullEstimatedCostCents * 0.55,
    );
    const sampled = await createEvalPlan(project.id, route.name, {
      modelRefs: [SONNET, HAIKU],
      budgetUsd: sampledBudgetCents / 100,
      executionMode: "workflow_replay",
    });
    assert.equal(sampled.disclosure.mode, "sampled");
    assert.ok(sampled.disclosure.selectedExampleIds.length >= 1);
    assert.ok(sampled.disclosure.selectedExampleIds.length < sampled.disclosure.fullExampleCount);
    assert.ok(sampled.disclosure.selectedEstimatedCostCents <= sampled.disclosure.budgetCents);

    let activeCandidate = "";
    const runtime: EvalRuntime = {
      async runCandidate({ modelRef, input }) {
        activeCandidate = modelRef;
        return {
          text: `${modelRef === HAIKU ? "Haiku" : "Sonnet"} answer: ${input}`,
          promptTokens: 20,
          completionTokens: 20,
          latencyMs: modelRef === HAIKU ? 35 : 60,
          costCents: modelRef === HAIKU ? 0.01 : 0.02,
        };
      },
      async judge() {
        const score = activeCandidate === HAIKU ? 0.9 : 0.93;
        return {
          verdict: {
            score: 0.1,
            perCriterion: [
              { criterion: "accuracy", score },
              { criterion: "clarity", score: score - 0.01 },
            ],
            reasoning: "Deterministic local test verdict",
          },
          promptTokens: 30,
          completionTokens: 10,
          costCents: 0.005,
        };
      },
    };

    // A candidate-only plan is useful for issue discovery, but cannot prove a safe swap
    // because the current live model was not evaluated on the same authorized examples.
    const candidateOnly = await createEvalPlan(project.id, route.name, {
      modelRefs: [HAIKU],
      budgetUsd: 1,
      executionMode: "workflow_replay",
    });
    const candidateOnlyResult = await runAuthorizedEvalPlan(
      project.id,
      candidateOnly.id,
      true,
      runtime,
    );
    assert.equal(
      candidateOnlyResult.recommendation,
      null,
      "candidate-only evidence must not create a model-swap recommendation",
    );

    const result = await runAuthorizedEvalPlan(project.id, sampled.id, true, runtime);
    assert.equal(result.plan.status, "completed");
    assert.equal(result.runs.length, 2);
    assert.ok((result.plan.actualCostCents ?? Infinity) <= result.plan.budgetCents);
    assert.equal(result.recommendation?.toModel, HAIKU);
    assert.equal(result.recommendation?.status, "pending");
    assert.ok((result.recommendation?.evidenceJson.perCriterion.length ?? 0) > 0);
    assert.ok((result.recommendation?.evidenceJson.samples.length ?? 0) > 0);

    const liveAfter = (
      await db.select({ liveModel: routes.liveModel }).from(routes).where(eq(routes.id, route.id))
    )[0]?.liveModel;
    assert.equal(liveAfter, SONNET, "an eval-backed Recommendation must not silently switch live_model");
    const storedEvidence = await db
      .select()
      .from(evalExampleResults)
      .where(eq(evalExampleResults.evalRunId, result.runs[0]!.evalRunId));
    assert.equal(storedEvidence.length, sampled.disclosure.selectedExampleIds.length);
    assert.ok(
      storedEvidence.every((row) => (row.score ?? 0) > 0.85),
      "persisted scores must be the visible criterion mean, not a free-form judge overall",
    );
    const planRows = await db.select().from(evalPlans).where(eq(evalPlans.id, sampled.id));
    assert.equal(planRows[0]?.status, "completed");
    const recRows = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.routeId, route.id));
    assert.equal(recRows.length, 1);

    await db.update(routes).set({ liveModel: HAIKU }).where(eq(routes.id, route.id));
    await assert.rejects(
      approveRecommendation(recRows[0]!.id, project.id),
      /route live model changed/,
      "stale recommendation evidence must not overwrite a newer live-model decision",
    );
    await db.update(routes).set({ liveModel: SONNET }).where(eq(routes.id, route.id));

    const realDriftsBeforeScreening = await db
      .select({ id: driftEvents.id })
      .from(driftEvents)
      .where(eq(driftEvents.routeId, route.id));
    const screeningPlan = await createEvalPlan(project.id, route.name, {
      modelRefs: [SONNET],
      budgetUsd: 1,
      executionMode: "model_only",
    });
    const lowScreeningRuntime: EvalRuntime = {
      async runCandidate({ input }) {
        return {
          text: `Screening output: ${input}`,
          promptTokens: 10,
          completionTokens: 10,
          latencyMs: 20,
          costCents: 0.01,
        };
      },
      async judge() {
        return {
          verdict: {
            score: 0.2,
            perCriterion: [{ criterion: "accuracy", score: 0.2 }],
            reasoning: "Low screening-only score",
          },
          promptTokens: 10,
          completionTokens: 10,
          costCents: 0.005,
        };
      },
    };
    const screeningResult = await runAuthorizedEvalPlan(
      project.id,
      screeningPlan.id,
      true,
      lowScreeningRuntime,
    );
    const realDriftsAfterScreening = await db
      .select({ id: driftEvents.id })
      .from(driftEvents)
      .where(eq(driftEvents.routeId, route.id));
    assert.equal(screeningResult.drift, null, "model-only screening must not become live drift evidence");
    assert.equal(
      realDriftsAfterScreening.length,
      realDriftsBeforeScreening.length,
      "model-only screening must not create a golden-eval drift event",
    );

    const runsBeforeSimulation = await db
      .select({ id: evalRuns.id })
      .from(evalRuns)
      .where(eq(evalRuns.routeId, route.id));
    const simulation = await checkDrift({ routeId: route.id, simulateNewScore: 0.1 });
    const runsAfterSimulation = await db
      .select({ id: evalRuns.id })
      .from(evalRuns)
      .where(eq(evalRuns.routeId, route.id));
    assert.equal(
      runsAfterSimulation.length,
      runsBeforeSimulation.length,
      "a drift simulation must never create eval evidence",
    );
    assert.equal(simulation.recommendation, null, "a simulation must never create an approval");

    const observedWorkflow = (
      await db
        .insert(workflows)
        .values({
          projectId: project.id,
          name: "observe-only-test",
          environment: "local",
          integrationMode: "observe_only",
        })
        .returning()
    )[0]!;
    const observedRoute = (
      await db
        .insert(routes)
        .values({
          projectId: project.id,
          name: "observe-only-test@local:answer",
          liveModel: SONNET,
          policyJson: { type: "cheapest_passing", minScore: 0.85 },
        })
        .returning()
    )[0]!;
    await db.insert(workflowNodes).values({
      workflowId: observedWorkflow.id,
      routeId: observedRoute.id,
      name: "answer",
      kind: "generation",
      latestModel: SONNET,
      requirementsJson: {
        inputModalities: ["text"],
        outputModalities: ["text"],
        toolCalling: false,
        structuredOutput: false,
        streaming: false,
        systemMessages: false,
      },
    });
    const observeRecommendation = (
      await db
        .insert(recommendations)
        .values({
          routeId: observedRoute.id,
          fromModel: SONNET,
          toModel: HAIKU,
          evidenceJson: {
            fromModel: SONNET,
            toModel: HAIKU,
            fromScore: 0.9,
            toScore: 0.9,
            costDeltaPct: -50,
            latencyDeltaMs: -10,
            perCriterion: [{ criterion: "accuracy", from: 0.9, to: 0.9 }],
            samples: [{ input: "test", fromOutput: "a", toOutput: "b" }],
          },
        })
        .returning()
    )[0]!;
    const observedApproval = await approveRecommendation(observeRecommendation.id, project.id);
    const observedRouteAfter = (
      await db.select().from(routes).where(eq(routes.id, observedRoute.id)).limit(1)
    )[0]!;
    assert.equal(observedApproval.applicationStatus, "awaiting_rollout");
    assert.equal(
      observedRouteAfter.liveModel,
      SONNET,
      "observe-only approval must not pretend it changed the connected app",
    );

    let duplicateBlocked = false;
    try {
      await runAuthorizedEvalPlan(project.id, sampled.id, true, runtime);
    } catch {
      duplicateBlocked = true;
    }
    assert.equal(duplicateBlocked, true, "a confirmed plan must be single-use");

    const concurrentVersions = await Promise.all(
      Array.from({ length: 4 }, () =>
        createGoldenSet({ routeId: route.id, origin: "grown", examples: [] }),
      ),
    );
    assert.deepEqual(
      concurrentVersions.map((set) => set.version).sort((a, b) => a - b),
      [2, 3, 4, 5],
      "concurrent golden-set creation must allocate unique consecutive versions",
    );

    console.log(
      JSON.stringify({
        passed: true,
        mode: sampled.disclosure.mode,
        selectedExamples: sampled.disclosure.selectedExampleIds.length,
        totalExamples: sampled.disclosure.fullExampleCount,
        models: result.runs.length,
        evidenceRows: storedEvidence.length,
        recommendation: result.recommendation?.status,
        liveModelUnchanged: liveAfter === SONNET,
        legacyAggregateBlocked: true,
        candidateOnlySwapBlocked: candidateOnlyResult.recommendation == null,
        crossRouteTracePromotionBlocked: true,
        concurrentGoldenVersionsSafe: true,
        staleApprovalBlocked: true,
        duplicateRunBlocked: duplicateBlocked,
        sdkExecutionBoundarySafe: true,
        ordinaryChildSpanIngestSafe:
          lifecycleSpans.length === 2 && lifecycleExecution.status === "completed",
        deterministicCriteriaScore: true,
        modelOnlyDriftBlocked: true,
        driftSimulationQuarantined: true,
        observeOnlyApprovalAwaitsRollout: true,
        providerTokenCost: 0,
        inviteProjectAndKeySafe: true,
        signedSignupIdempotentAndHashOnly: true,
        concurrentSignupCreatesOneProject: true,
        projectScopedFeedbackSafe: feedbackHistory[0]?.projectId === project.id,
      }),
    );
  } finally {
    await db.delete(projects).where(eq(projects.id, project.id));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "eval plan integration test failed");
    process.exit(1);
  });
