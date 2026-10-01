import { Hono } from "hono";
import { getWorkflowMetrics, recordExecutionFeedback } from "@blindspot/core";
import { ExecutionFeedbackInputSchema, MetricsWindowSchema } from "@blindspot/shared";
import type { Env } from "../types";

export const monitorRouter = new Hono<Env>();

// Dashboard-read: operational metrics for one workflow (+ optional node), windowed.
monitorRouter.get("/metrics", async (c) => {
  const workflowId = c.req.query("workflowId");
  if (!workflowId) {
    return c.json({ error: { message: "workflowId is required" } }, 400);
  }
  const window = MetricsWindowSchema.catch("7d").parse(c.req.query("window"));
  const nodeId = c.req.query("nodeId") || null;
  const result = await getWorkflowMetrics(c.get("projectId"), { workflowId, nodeId, window });
  if (!result) return c.json({ error: { message: "workflow not found" } }, 404);
  return c.json(result);
});

// SDK-write: one end-user feedback event (👍/👎/score). Metadata-safe; comment is optional.
monitorRouter.post("/feedback", async (c) => {
  const parsed = ExecutionFeedbackInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: { message: parsed.error.issues[0]?.message ?? "invalid feedback" } },
      400,
    );
  }
  try{return c.json({ feedback: await recordExecutionFeedback(c.get("projectId"), parsed.data) }, 201);}
  catch(error){if((error as {code?:string}).code==='PREPARED_READ_ONLY')return c.json({error:{message:'Prepared examples do not accept feedback edits.'}},409);throw error;}
});
