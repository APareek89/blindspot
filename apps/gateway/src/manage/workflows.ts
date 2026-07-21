// Workflow ingestion and selection API. SDK telemetry arrives through the same project-key
// authentication as the gateway, is size/schema checked here, and is persisted by core services.
// Content retention is enforced server-side from the project's Data Controls setting.

import { Hono } from "hono";
import {
  getDataControls,
  getOwnedRoute,
  getRouteWorkflowContext,
  getWorkflowDetail,
  ingestWorkflowSpans,
  listWorkflows,
  resolveWorkflowModel,
  shareWorkflowContext,
  updateDataControls,
  updateWorkflowReplayConfig,
  updateWorkflowSelection,
} from "@blindspot/core";
import {
  DataControlsPatchSchema,
  WorkflowContextShareInputSchema,
  WorkflowModelResolveInputSchema,
  WorkflowReplayConfigInputSchema,
  WorkflowPatchSchema,
  WorkflowSpanBatchSchema,
} from "@blindspot/shared";
import type { Env } from "../types";

export const workflowsRouter = new Hono<Env>();

const MAX_INGEST_BYTES = 1_000_000;

workflowsRouter.post("/ingest/spans", async (c) => {
  const declaredLength = Number(c.req.header("content-length") ?? 0);
  if (declaredLength > MAX_INGEST_BYTES) {
    return c.json({ error: { message: "telemetry batch exceeds 1 MB" } }, 413);
  }
  const raw = await c.req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_INGEST_BYTES) {
    return c.json({ error: { message: "telemetry batch exceeds 1 MB" } }, 413);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return c.json({ error: { message: "telemetry body must be valid JSON" } }, 400);
  }
  const parsed = WorkflowSpanBatchSchema.safeParse(json);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          message: "invalid telemetry batch",
          detail: parsed.error.issues[0]?.message,
        },
      },
      400,
    );
  }
  try {
    return c.json(await ingestWorkflowSpans(c.get("projectId"), parsed.data.spans));
  } catch (error) {
    console.error("[gateway] workflow ingest failed:", (error as Error).message);
    return c.json({ error: { message: "workflow telemetry could not be stored" } }, 500);
  }
});

workflowsRouter.post("/workflow-context", async (c) => {
  const parsed = WorkflowContextShareInputSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return c.json({ error: { message: parsed.error.issues[0]?.message ?? "invalid context manifest" } }, 400);
  }
  return c.json({
    workflow: await shareWorkflowContext(c.get("projectId"), parsed.data),
  });
});

workflowsRouter.post("/workflows/resolve-model", async (c) => {
  const parsed = WorkflowModelResolveInputSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return c.json({ error: { message: parsed.error.issues[0]?.message ?? "invalid model resolution" } }, 400);
  }
  try {
    return c.json(await resolveWorkflowModel(c.get("projectId"), parsed.data));
  } catch (error) {
    return c.json({ error: { message: (error as Error).message } }, 409);
  }
});

workflowsRouter.get("/routes/:name/workflow-context", async (c) => {
  const route = await getOwnedRoute(c.get("projectId"), c.req.param("name"));
  if (!route) return c.json({ error: { message: "route not found" } }, 404);
  return c.json({
    workflow_context: await getRouteWorkflowContext(c.get("projectId"), route.id),
  });
});

workflowsRouter.get("/workflows", async (c) => {
  return c.json({ workflows: await listWorkflows(c.get("projectId")) });
});

workflowsRouter.get("/workflows/:id", async (c) => {
  const detail = await getWorkflowDetail(c.get("projectId"), c.req.param("id"));
  if (!detail) return c.json({ error: { message: "workflow not found" } }, 404);
  return c.json(detail);
});

workflowsRouter.patch("/workflows/:id", async (c) => {
  const parsed = WorkflowPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: { message: parsed.error.issues[0]?.message } }, 400);
  }
  const workflow = await updateWorkflowSelection(
    c.get("projectId"),
    c.req.param("id"),
    parsed.data.selected,
  );
  if (!workflow) return c.json({ error: { message: "workflow not found" } }, 404);
  return c.json({ workflow });
});

workflowsRouter.put("/workflows/:id/replay", async (c) => {
  const parsed = WorkflowReplayConfigInputSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return c.json({ error: { message: parsed.error.issues[0]?.message ?? "invalid replay config" } }, 400);
  }
  try {
    const workflow = await updateWorkflowReplayConfig(
      c.get("projectId"),
      c.req.param("id"),
      parsed.data,
    );
    if (!workflow) return c.json({ error: { message: "workflow not found" } }, 404);
    return c.json({ workflow });
  } catch (error) {
    return c.json({ error: { message: (error as Error).message } }, 409);
  }
});

workflowsRouter.get("/data-controls", async (c) => {
  const controls = await getDataControls(c.get("projectId"));
  if (!controls) return c.json({ error: { message: "project not found" } }, 404);
  return c.json(controls);
});

workflowsRouter.patch("/data-controls", async (c) => {
  const parsed = DataControlsPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: { message: parsed.error.issues[0]?.message } }, 400);
  }
  const controls = await updateDataControls(c.get("projectId"), parsed.data.captureMode);
  if (!controls) return c.json({ error: { message: "project not found" } }, 404);
  return c.json(controls);
});
