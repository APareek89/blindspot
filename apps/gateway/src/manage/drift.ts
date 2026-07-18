import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { checkDrift, listDriftEvents } from "@blindspot/core";
import { driftEvents, getDb } from "@blindspot/db";
import { clampPagination } from "@blindspot/shared";
import { getRouteByName } from "../route-resolver";
import type { Env } from "../types";

/** Drift detection + CI gate (PRD §5). Mounted under /v1. */
export const driftRouter = new Hono<Env>();

// project-wide drift timeline (PRD §10 Drift) — each event linked to its pending rec
driftRouter.get("/drift-events", async (c) => {
  return c.json(
    await listDriftEvents(c.get("projectId"), {
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
    }),
  );
});

// re-eval the live model (or inject a simulated post-version-bump score) and flag drift
driftRouter.post("/routes/:name/drift-check", async (c) => {
  const projectId = c.get("projectId");
  const route = await getRouteByName(projectId, c.req.param("name"));
  if (!route) return c.json({ error: { message: "route not found" } }, 404);

  const body = (await c.req.json().catch(() => ({}))) as {
    simulateNewScore?: number;
    margin?: number;
  };
  if (body.simulateNewScore == null) {
    return c.json(
      {
        error: {
          message:
            "Live drift re-evaluation requires an approved eval plan; only an explicit simulated score is available in Phase 7C",
        },
      },
      409,
    );
  }
  try {
    const result = await checkDrift({
      routeId: route.id,
      simulateNewScore: body.simulateNewScore,
      margin: body.margin,
    });
    return c.json(result);
  } catch (e) {
    return c.json({ error: { message: (e as Error).message } }, 502);
  }
});

driftRouter.get("/routes/:name/drift-events", async (c) => {
  const route = await getRouteByName(c.get("projectId"), c.req.param("name"));
  if (!route) return c.json({ error: { message: "route not found" } }, 404);
  const { limit, offset } = clampPagination(c.req.query("limit"), c.req.query("offset"));
  const rows = await getDb()
    .select()
    .from(driftEvents)
    .where(eq(driftEvents.routeId, route.id))
    .orderBy(desc(driftEvents.createdAt))
    .limit(limit)
    .offset(offset);
  return c.json({ drift_events: rows });
});

// A CI gate also spends provider tokens, so the legacy unbudgeted path stays closed until
// Phase 8 can hand an already-authorized plan to the worker and await its result.
driftRouter.post("/routes/:name/gate", async (c) => {
  const route = await getRouteByName(c.get("projectId"), c.req.param("name"));
  if (!route) return c.json({ error: { message: "route not found" } }, 404);
  return c.json(
    { error: { message: "CI eval gates require an approved eval plan in Phase 7C" } },
    409,
  );
});
