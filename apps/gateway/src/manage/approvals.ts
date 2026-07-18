import { Hono } from "hono";
import {
  approveRecommendation,
  generateRecommendation,
  listRecommendations,
  rejectRecommendation,
} from "@blindspot/core";
import { getRouteByName } from "../route-resolver";
import type { Env } from "../types";

/** Approvals inbox + recommendation actions (PRD §3, §10 Approvals). Mounted under /v1. */
export const approvals = new Hono<Env>();

// run the policy for a route now and (maybe) create a recommendation
approvals.post("/routes/:name/recommend", async (c) => {
  const route = await getRouteByName(c.get("projectId"), c.req.param("name"));
  if (!route) return c.json({ error: { message: "route not found" } }, 404);
  const rec = await generateRecommendation(route.id);
  return c.json({
    recommendation: rec ?? null,
    note: rec
      ? undefined
      : "no cheaper passing candidate with complete same-plan live-model evidence",
  });
});

// the inbox
approvals.get("/recommendations", async (c) => {
  const status = c.req.query("status");
  const valid = status === "pending" || status === "approved" || status === "rejected";
  return c.json({
    recommendations: await listRecommendations({
      projectId: c.get("projectId"),
      status: valid ? status : undefined,
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
    }),
  });
});

approvals.post("/recommendations/:id/approve", async (c) => {
  try {
    const rec = await approveRecommendation(c.req.param("id"), c.get("projectId"));
    return c.json({ recommendation: rec });
  } catch (e) {
    return c.json({ error: { message: (e as Error).message } }, 400);
  }
});

approvals.post("/recommendations/:id/reject", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  try {
    const rec = await rejectRecommendation(
      c.req.param("id"),
      c.get("projectId"),
      body.reason,
    );
    return c.json({ recommendation: rec });
  } catch (e) {
    return c.json({ error: { message: (e as Error).message } }, 400);
  }
});
