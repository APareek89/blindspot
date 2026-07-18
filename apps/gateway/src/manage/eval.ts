import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  EvalBudgetTooLowError,
  EvalPlanStateError,
  addCompatibleCandidate,
  createEvalPlan,
  getEvalPlan,
  listEvalRunEvidence,
  runAuthorizedEvalPlan,
} from "@blindspot/core";
import { evalRuns, getDb } from "@blindspot/db";
import {
  EvalPlanCreateInputSchema,
  EvalPlanRunInputSchema,
  clampPagination,
} from "@blindspot/shared";
import { getRouteByName } from "../route-resolver";
import type { Env } from "../types";

/** Candidate pool + eval endpoints (PRD §5, §6). Mounted under /v1. */
export const evalRouter = new Hono<Env>();

// Add only a technically compatible candidate. Phase 7C estimates/authorizes the paid back-test.
evalRouter.post("/routes/:name/candidates", async (c) => {
  const projectId = c.get("projectId");
  const body = (await c.req.json().catch(() => null)) as
    | { modelRef?: string }
    | null;
  if (!body?.modelRef) return c.json({ error: { message: "expected { modelRef }" } }, 400);
  const result = await addCompatibleCandidate(projectId, c.req.param("name"), body.modelRef);
  if (!result.ok) return c.json({ error: { message: result.error } }, result.status as 400 | 404 | 409);
  return c.json(result);
});

// Legacy raw-spend path is deliberately closed. Callers must estimate, inspect and confirm a plan.
evalRouter.post("/routes/:name/eval", async (c) => {
  const route = await getRouteByName(c.get("projectId"), c.req.param("name"));
  if (!route) return c.json({ error: { message: "route not found" } }, 404);
  return c.json(
    { error: { message: "Calculate and confirm an eval plan before any paid run" } },
    409,
  );
});

evalRouter.post("/routes/:name/eval-plans", async (c) => {
  const parsed = EvalPlanCreateInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: { message: parsed.error.issues[0]?.message ?? "invalid eval plan" } }, 400);
  }
  try {
    const plan = await createEvalPlan(c.get("projectId"), c.req.param("name"), parsed.data);
    return c.json({ plan }, 201);
  } catch (error) {
    if (error instanceof EvalBudgetTooLowError) {
      return c.json(
        {
          error: {
            message: error.message,
            minimumBudgetCents: error.minimumBudgetCents,
            fullEstimatedCostCents: error.fullEstimatedCostCents,
          },
        },
        422,
      );
    }
    return c.json({ error: { message: (error as Error).message } }, 409);
  }
});

evalRouter.get("/eval-plans/:id", async (c) => {
  const plan = await getEvalPlan(c.get("projectId"), c.req.param("id"));
  if (!plan) return c.json({ error: { message: "eval plan not found" } }, 404);
  return c.json({ plan });
});

evalRouter.post("/eval-plans/:id/run", async (c) => {
  const parsed = EvalPlanRunInputSchema.safeParse({
    ...(await c.req.json().catch(() => null)),
    planId: c.req.param("id"),
  });
  if (!parsed.success) {
    return c.json({ error: { message: "Explicit { confirm: true } is required" } }, 400);
  }
  try {
    return c.json({
      result: await runAuthorizedEvalPlan(
        c.get("projectId"),
        parsed.data.planId,
        parsed.data.confirm,
      ),
    });
  } catch (error) {
    const status = error instanceof EvalPlanStateError ? 409 : 502;
    return c.json(
      {
        error: {
          message:
            status === 409
              ? (error as Error).message
              : "Eval execution failed; inspect the plan and persisted example evidence",
        },
      },
      status,
    );
  }
});

evalRouter.get("/routes/:name/eval-evidence", async (c) => {
  const route = await getRouteByName(c.get("projectId"), c.req.param("name"));
  if (!route) return c.json({ error: { message: "route not found" } }, 404);
  return c.json({ runs: await listEvalRunEvidence(c.get("projectId"), route.id, 10) });
});

evalRouter.get("/routes/:name/eval-runs", async (c) => {
  const route = await getRouteByName(c.get("projectId"), c.req.param("name"));
  if (!route) return c.json({ error: { message: "route not found" } }, 404);
  const { limit, offset } = clampPagination(c.req.query("limit"), c.req.query("offset"));
  const rows = await getDb()
    .select()
    .from(evalRuns)
    .where(eq(evalRuns.routeId, route.id))
    .orderBy(desc(evalRuns.createdAt))
    .limit(limit)
    .offset(offset);
  return c.json({ eval_runs: rows });
});
