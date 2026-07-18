// Workflow observability turns SDK spans into Blindspot's workflow, node, execution and trace
// records. It is deliberately provider-agnostic: the SDK reports what happened, while this
// service applies the project's content-retention choice and links model generations to Routes.

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  candidates,
  getDb,
  projects,
  routes,
  traces,
  workflowExecutions,
  workflowNodes,
  workflowSpans,
  workflows,
} from "@blindspot/db";
import {
  CaptureModeSchema,
  DEFAULT_POLICY,
  NodeRequirementsSchema,
  type CaptureMode,
  type NodeRequirements,
  type WorkflowSpanInput,
} from "@blindspot/shared";

const CAPTURE_RANK: Record<CaptureMode, number> = { metadata: 0, inputs: 1, full: 2 };
const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /(^|[_-])(api[_-]?key|authorization|secret|password|access[_-]?token|refresh[_-]?token|cookie)$/i;

/** The server never stores more content than both the project and the emitting SDK allowed. */
function effectiveCapture(project: CaptureMode, sdk: CaptureMode): CaptureMode {
  return CAPTURE_RANK[project] <= CAPTURE_RANK[sdk] ? project : sdk;
}

/** Remove common credential fields even when the user selected full content capture. */
function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redactSecrets(child),
    ]),
  );
}

function jsonBytes(value: unknown): number | null {
  if (value === undefined) return null;
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return null;
  }
}

function outputText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/** Normalize observed provider/model values into Blindspot's provider:model convention. */
export function canonicalObservedModel(model?: string, provider?: string): string | null {
  if (!model) return null;
  if (model.includes(":")) return model;
  const inferred =
    provider ||
    (model.startsWith("claude-")
      ? "anthropic"
      : model.startsWith("gemini-")
        ? "gemini"
        : model.startsWith("gpt-") || /^o\d/.test(model)
          ? "openai"
          : null);
  return inferred ? `${inferred}:${model}` : model;
}

/** Requirements only become stricter as more real calls reveal what a node needs. */
function mergeRequirements(
  previous: NodeRequirements | undefined,
  observed: NodeRequirements,
): NodeRequirements {
  const before = previous ?? NodeRequirementsSchema.parse({});
  return {
    inputModalities: [...new Set([...before.inputModalities, ...observed.inputModalities])],
    outputModalities: [...new Set([...before.outputModalities, ...observed.outputModalities])],
    toolCalling: before.toolCalling || observed.toolCalling,
    structuredOutput: before.structuredOutput || observed.structuredOutput,
    streaming: before.streaming || observed.streaming,
    systemMessages: before.systemMessages || observed.systemMessages,
    minContextTokens: Math.max(before.minContextTokens ?? 0, observed.minContextTokens ?? 0) || undefined,
  };
}

/** Create or find the Route that represents a generation node without changing an existing live model. */
async function routeForObservedNode(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  projectId: string,
  workflowName: string,
  environment: string,
  nodeName: string,
  modelRef: string | null,
): Promise<string | null> {
  if (!modelRef?.includes(":")) return null;
  const name = `${workflowName}@${environment}:${nodeName}`;
  const inserted = await tx
    .insert(routes)
    .values({ projectId, name, liveModel: modelRef, policyJson: DEFAULT_POLICY })
    .onConflictDoNothing()
    .returning({ id: routes.id });
  const routeId =
    inserted[0]?.id ??
    (
      await tx
        .select({ id: routes.id })
        .from(routes)
        .where(and(eq(routes.projectId, projectId), eq(routes.name, name)))
        .limit(1)
    )[0]?.id;
  if (!routeId) throw new Error("observed route could not be resolved");
  await tx
    .insert(candidates)
    .values({ routeId, modelRef, source: "api", enabled: true })
    .onConflictDoNothing();
  return routeId;
}

/** Idempotently ingest a batch. A retry updates the same external span rather than double-counting it. */
export async function ingestWorkflowSpans(projectId: string, batch: WorkflowSpanInput[]) {
  const db = getDb();
  const project = (
    await db
      .select({ captureMode: projects.captureMode })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
  )[0];
  if (!project) throw new Error("project not found");

  const stored: { spanId: string; workflowId: string; nodeId: string }[] = [];
  for (const item of batch) {
    const result = await db.transaction(async (tx) => {
      const now = new Date();
      const workflowUpdate = {
        lastSeenAt: now,
        ...(item.workflow.framework ? { framework: item.workflow.framework } : {}),
        ...(item.workflow.language ? { language: item.workflow.language } : {}),
      };
      const workflow = (
        await tx
          .insert(workflows)
          .values({ projectId, ...item.workflow, firstSeenAt: now, lastSeenAt: now })
          .onConflictDoUpdate({
            target: [workflows.projectId, workflows.name, workflows.environment],
            set: workflowUpdate,
          })
          .returning()
      )[0];
      if (!workflow) throw new Error("workflow upsert failed");

      const modelRef = canonicalObservedModel(item.span.model, item.span.provider);
      const routeId =
        item.span.kind === "generation"
          ? await routeForObservedNode(
              tx,
              projectId,
              workflow.name,
              workflow.environment,
              item.span.node,
              modelRef,
            )
          : null;

      const observedRequirements = NodeRequirementsSchema.parse(item.span.requirements ?? {});
      const existingNode = (
        await tx
          .select()
          .from(workflowNodes)
          .where(
            and(
              eq(workflowNodes.workflowId, workflow.id),
              eq(workflowNodes.name, item.span.node),
            ),
          )
          .limit(1)
          .for("update")
      )[0];
      const requirements = mergeRequirements(existingNode?.requirementsJson, observedRequirements);
      let node = existingNode
        ? (
            await tx
              .update(workflowNodes)
              .set({
                kind: item.span.kind,
                latestModel: modelRef,
                routeId: routeId ?? existingNode.routeId,
                requirementsJson: requirements,
                lastSeenAt: now,
              })
              .where(eq(workflowNodes.id, existingNode.id))
              .returning()
          )[0]
        : (
            await tx
              .insert(workflowNodes)
              .values({
                workflowId: workflow.id,
                routeId,
                name: item.span.node,
                kind: item.span.kind,
                latestModel: modelRef,
                requirementsJson: requirements,
                firstSeenAt: now,
                lastSeenAt: now,
              })
              .onConflictDoNothing()
              .returning()
          )[0] ??
          (
            await tx
              .select()
              .from(workflowNodes)
              .where(
                and(
                  eq(workflowNodes.workflowId, workflow.id),
                  eq(workflowNodes.name, item.span.node),
                ),
              )
              .limit(1)
          )[0];
      if (!node) throw new Error("workflow node upsert failed");
      if (!existingNode) {
        // A concurrent first observation may have won the unique-key insert. Re-apply this
        // observation to the winner so stricter requirements and its model are not lost.
        node =
          (
            await tx
              .update(workflowNodes)
              .set({
                kind: item.span.kind,
                latestModel: modelRef,
                routeId: routeId ?? node.routeId,
                requirementsJson: mergeRequirements(
                  node.requirementsJson,
                  observedRequirements,
                ),
                lastSeenAt: now,
              })
              .where(eq(workflowNodes.id, node.id))
              .returning()
          )[0] ?? node;
      }

      const execution = (
        // A completed model span does not necessarily mean the whole agent workflow is done.
        // Integrations mark executionStatus explicitly at the real request boundary.
        await tx
          .insert(workflowExecutions)
          .values({
            workflowId: workflow.id,
            externalId: item.execution.id,
            sessionId: item.execution.sessionId,
            status:
              item.execution.status ?? (item.span.status === "error" ? "error" : "running"),
            metadataJson: redactSecrets(item.execution.metadata) as Record<string, unknown> | undefined,
            startedAt: item.execution.startedAt ? new Date(item.execution.startedAt) : now,
            endedAt: item.execution.endedAt ? new Date(item.execution.endedAt) : undefined,
          })
          .onConflictDoUpdate({
            target: [workflowExecutions.workflowId, workflowExecutions.externalId],
            set: {
              ...(item.execution.status || item.span.status === "error"
                ? {
                    status:
                      item.execution.status ??
                      (item.span.status === "error" ? "error" : "running"),
                  }
                : {}),
              ...(item.execution.endedAt
                ? { endedAt: new Date(item.execution.endedAt) }
                : {}),
              ...(item.execution.sessionId ? { sessionId: item.execution.sessionId } : {}),
              ...(item.execution.metadata
                ? {
                    metadataJson: redactSecrets(item.execution.metadata) as Record<string, unknown>,
                  }
                : {}),
            },
          })
          .returning()
      )[0];
      if (!execution) throw new Error("workflow execution upsert failed");

      const mode = effectiveCapture(project.captureMode, item.captureMode);
      const safeInput = item.span.input === undefined ? undefined : redactSecrets(item.span.input);
      const safeOutput = item.span.output === undefined ? undefined : redactSecrets(item.span.output);
      const keepInput = mode === "inputs" || mode === "full";
      const keepOutput = mode === "full";
      const span = (
        await tx
          .insert(workflowSpans)
          .values({
            executionId: execution.id,
            nodeId: node.id,
            externalId: item.span.id,
            parentExternalId: item.span.parentId,
            model: modelRef,
            status: item.span.status,
            captureMode: mode,
            inputJson: keepInput ? safeInput : undefined,
            outputJson: keepOutput ? safeOutput : undefined,
            inputBytes: jsonBytes(safeInput),
            outputBytes: jsonBytes(safeOutput),
            inputTokens: item.span.inputTokens,
            outputTokens: item.span.outputTokens,
            costCents: item.span.costCents,
            latencyMs: item.span.latencyMs,
            error: item.span.error,
            metadataJson: redactSecrets(item.span.metadata) as Record<string, unknown> | undefined,
            startedAt: item.span.startedAt ? new Date(item.span.startedAt) : now,
            endedAt: item.span.endedAt ? new Date(item.span.endedAt) : now,
          })
          .onConflictDoUpdate({
            target: [workflowSpans.executionId, workflowSpans.externalId],
            set: {
              status: item.span.status,
              captureMode: mode,
              inputJson: keepInput ? safeInput : null,
              outputJson: keepOutput ? safeOutput : null,
              inputBytes: jsonBytes(safeInput),
              outputBytes: jsonBytes(safeOutput),
              inputTokens: item.span.inputTokens,
              outputTokens: item.span.outputTokens,
              costCents: item.span.costCents,
              latencyMs: item.span.latencyMs,
              error: item.span.error,
              metadataJson: redactSecrets(item.span.metadata) as Record<string, unknown> | undefined,
              endedAt: item.span.endedAt ? new Date(item.span.endedAt) : now,
            },
          })
          .returning()
      )[0];
      if (!span) throw new Error("workflow span upsert failed");

      // Keep the existing Route/Trace loop useful: one flat trace mirrors each generation span.
      if (routeId && modelRef && !span.traceId) {
        const trace = (
          await tx
            .insert(traces)
            .values({
              routeId,
              model: modelRef,
              input:
                keepInput && safeInput !== undefined
                  ? safeInput
                  : { unavailable: true, captureMode: mode },
              output: keepOutput ? outputText(safeOutput) : null,
              costCents: item.span.costCents,
              latencyMs: item.span.latencyMs,
            })
            .returning({ id: traces.id })
        )[0];
        if (trace) {
          await tx
            .update(workflowSpans)
            .set({ traceId: trace.id })
            .where(eq(workflowSpans.id, span.id));
        }
      }

      return { spanId: span.id, workflowId: workflow.id, nodeId: node.id };
    });
    stored.push(result);
  }
  return { accepted: stored.length, spans: stored };
}

/** Workflow discovery view, bounded for the prototype dashboard. */
export async function listWorkflows(projectId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.projectId, projectId))
    .orderBy(desc(workflows.lastSeenAt))
    .limit(100);
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const nodeCounts = await db
    .select({ workflowId: workflowNodes.workflowId, count: sql<number>`count(*)::int` })
    .from(workflowNodes)
    .where(inArray(workflowNodes.workflowId, ids))
    .groupBy(workflowNodes.workflowId);
  const executionCounts = await db
    .select({ workflowId: workflowExecutions.workflowId, count: sql<number>`count(*)::int` })
    .from(workflowExecutions)
    .where(inArray(workflowExecutions.workflowId, ids))
    .groupBy(workflowExecutions.workflowId);
  const nodesByWorkflow = new Map(nodeCounts.map((row) => [row.workflowId, row.count]));
  const executionsByWorkflow = new Map(executionCounts.map((row) => [row.workflowId, row.count]));
  return rows.map((row) => ({
    ...row,
    nodeCount: nodesByWorkflow.get(row.id) ?? 0,
    executionCount: executionsByWorkflow.get(row.id) ?? 0,
  }));
}

/** Node-level observability is the basis for later compatibility filtering. */
export async function getWorkflowDetail(projectId: string, workflowId: string) {
  const db = getDb();
  const workflow = (
    await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.projectId, projectId), eq(workflows.id, workflowId)))
      .limit(1)
  )[0];
  if (!workflow) return null;
  const nodes = await db
    .select({
      id: workflowNodes.id,
      routeId: workflowNodes.routeId,
      name: workflowNodes.name,
      kind: workflowNodes.kind,
      latestModel: workflowNodes.latestModel,
      requirements: workflowNodes.requirementsJson,
      firstSeenAt: workflowNodes.firstSeenAt,
      lastSeenAt: workflowNodes.lastSeenAt,
      spanCount: sql<number>`count(${workflowSpans.id})::int`,
      avgLatencyMs: sql<number | null>`avg(${workflowSpans.latencyMs})::float`,
      totalCostCents: sql<number>`coalesce(sum(${workflowSpans.costCents}), 0)::float`,
      errorCount: sql<number>`count(*) filter (where ${workflowSpans.status} = 'error')::int`,
    })
    .from(workflowNodes)
    .leftJoin(workflowSpans, eq(workflowSpans.nodeId, workflowNodes.id))
    .where(eq(workflowNodes.workflowId, workflow.id))
    .groupBy(workflowNodes.id)
    .orderBy(desc(workflowNodes.lastSeenAt));
  return { workflow, nodes };
}

export async function updateWorkflowSelection(
  projectId: string,
  workflowId: string,
  selected: boolean,
) {
  return (
    await getDb()
      .update(workflows)
      .set({ selected })
      .where(and(eq(workflows.projectId, projectId), eq(workflows.id, workflowId)))
      .returning()
  )[0] ?? null;
}

export async function getDataControls(projectId: string) {
  return (
    await getDb()
      .select({ captureMode: projects.captureMode })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
  )[0] ?? null;
}

export async function updateDataControls(projectId: string, captureMode: CaptureMode) {
  const mode = CaptureModeSchema.parse(captureMode);
  return (
    await getDb()
      .update(projects)
      .set({ captureMode: mode })
      .where(eq(projects.id, projectId))
      .returning({ captureMode: projects.captureMode })
  )[0] ?? null;
}
