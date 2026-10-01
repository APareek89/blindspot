import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  executionFeedback,
  getDb,
  projects,
  workflowExecutions,
  workflowNodes,
  workflowSpans,
  workflows,
} from "@blindspot/db";
import { getWorkflowMetrics, recordExecutionFeedback } from "@blindspot/core";
import { loadRootEnv } from "@blindspot/shared";

loadRootEnv(import.meta.url);

const HAIKU = "anthropic:claude-haiku-4-5-20251001";

/** Insert one execution with a single generation span at an explicit time. */
async function seedExecution(
  db: ReturnType<typeof getDb>,
  args: {
    workflowId: string;
    nodeId: string;
    at: Date;
    status: "completed" | "error" | "running";
    latencyMs: number;
    costCents: number;
    spanStatus?: "ok" | "error";
  },
) {
  const externalId = `exec-${randomUUID()}`;
  const execution = (
    await db
      .insert(workflowExecutions)
      .values({
        workflowId: args.workflowId,
        externalId,
        status: args.status,
        startedAt: args.at,
        endedAt: args.status === "running" ? null : new Date(args.at.getTime() + args.latencyMs),
      })
      .returning()
  )[0]!;
  await db.insert(workflowSpans).values({
    executionId: execution.id,
    nodeId: args.nodeId,
    externalId: `span-${randomUUID()}`,
    model: HAIKU,
    status: args.spanStatus ?? (args.status === "error" ? "error" : "ok"),
    captureMode: "metadata",
    latencyMs: args.latencyMs,
    costCents: args.costCents,
    startedAt: args.at,
    endedAt: new Date(args.at.getTime() + args.latencyMs),
  });
  return externalId;
}

async function main() {
  const db = getDb();
  const now = new Date("2026-07-22T12:00:00.000Z");
  const day = 24 * 60 * 60 * 1000;
  const inWindow = new Date(now.getTime() - 2 * day); // inside the last 7 days
  const inPrevWindow = new Date(now.getTime() - 9 * day); // inside the prior 7 days

  const project = (
    await db
      .insert(projects)
      .values({ userId: `metrics-test-${randomUUID()}`, name: "Metrics test" })
      .returning()
  )[0]!;

  try {
    const workflow = (
      await db
        .insert(workflows)
        .values({ projectId: project.id, name: "metrics-wf", environment: "test" })
        .returning()
    )[0]!;
    const node = (
      await db
        .insert(workflowNodes)
        .values({
          workflowId: workflow.id,
          name: "answer",
          kind: "generation",
          latestModel: HAIKU,
          requirementsJson: {
            inputModalities: ["text"],
            outputModalities: ["text"],
            toolCalling: false,
            structuredOutput: false,
            streaming: false,
            systemMessages: false,
          },
        })
        .returning()
    )[0]!;

    // current window: 2 completed (100ms, 300ms) + 1 error; previous window: 1 completed (200ms)
    await seedExecution(db, { workflowId: workflow.id, nodeId: node.id, at: inWindow, status: "completed", latencyMs: 100, costCents: 0.01 });
    await seedExecution(db, { workflowId: workflow.id, nodeId: node.id, at: inWindow, status: "completed", latencyMs: 300, costCents: 0.03 });
    await seedExecution(db, { workflowId: workflow.id, nodeId: node.id, at: inWindow, status: "error", latencyMs: 50, costCents: 0.0, spanStatus: "error" });
    await seedExecution(db, { workflowId: workflow.id, nodeId: node.id, at: inPrevWindow, status: "completed", latencyMs: 200, costCents: 0.02 });

    // feedback: 3 up, 1 down in the current window (via the service, to test workflow linking)
    const currentFeedbackIds: string[] = [];
    for (const kind of ["up", "up", "up", "down"] as const) {
      currentFeedbackIds.push(
        (
          await recordExecutionFeedback(project.id, {
            workflow: { name: "metrics-wf", environment: "test" },
            executionId: `fb-${randomUUID()}`,
            kind,
          })
        ).id,
      );
    }
    // Keep all synthetic feedback inside the explicit fixture clock's window.
    for (const feedbackId of currentFeedbackIds) {
      await db
        .update(executionFeedback)
        .set({ createdAt: inWindow })
        .where(eq(executionFeedback.id, feedbackId));
    }
    // Backdate one feedback row (a 'down') into the previous window so deltas are exercised.
    await db
      .update(executionFeedback)
      .set({ createdAt: inPrevWindow })
      .where(eq(executionFeedback.id, currentFeedbackIds[currentFeedbackIds.length - 1]!));

    const m = await getWorkflowMetrics(project.id, { workflowId: workflow.id, window: "7d", now });
    assert.ok(m, "owning project must receive metrics");

    assert.equal(m.executions.current, 3, "current window has 3 executions");
    assert.equal(m.executions.previous, 1, "previous window has 1 execution");
    assert.equal(Math.round(m.failureRatePct.current ?? -1), 33, "1 of 3 executions failed");
    assert.equal(m.avgLatencyMs.current, 200, "avg of 100 and 300 (errors excluded) = 200");
    assert.ok((m.p95LatencyMs.current ?? 0) >= 200, "p95 reflects the tail");
    assert.ok(Math.abs((m.costCents.current ?? 0) - 0.04) < 1e-9, "cost sums span costs");
    assert.equal(m.feedbackScorePct.current, 100, "3 up of 3 in-window (1 down backdated) = 100%");
    assert.ok(m.trend.length >= 1, "monthly trend is populated");
    assert.ok(m.nodes.some((n) => n.name === "answer"), "node filter list includes the node");

    // node filter narrows latency/cost/errors to the node (same values here, one node)
    const scoped = await getWorkflowMetrics(project.id, {
      workflowId: workflow.id,
      nodeId: node.id,
      window: "7d",
      now,
    });
    assert.ok(scoped, "scoped metrics must be returned");
    assert.equal(scoped.avgLatencyMs.current, 200, "node-scoped latency matches");

    // Tenant isolation: a different project must not read this workflow's metrics (FMEA P0).
    const otherProject = (
      await db
        .insert(projects)
        .values({ userId: `metrics-other-${randomUUID()}`, name: "Metrics other-tenant" })
        .returning()
    )[0]!;
    const leak = await getWorkflowMetrics(otherProject.id, {
      workflowId: workflow.id,
      window: "7d",
      now,
    });
    await db.delete(projects).where(eq(projects.id, otherProject.id));
    assert.equal(leak, null, "a different project must not read this workflow's metrics");

    console.log(
      JSON.stringify({ passed: true, executions: m.executions, feedbackScorePct: m.feedbackScorePct.current }),
    );
  } finally {
    await db.delete(projects).where(eq(projects.id, project.id));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "metrics integration test failed");
    process.exit(1);
  });
