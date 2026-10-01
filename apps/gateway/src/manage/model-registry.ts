import { Hono } from "hono";
import {
  MissingProviderKeyError,
  getRouteModelCompatibility,
  listModelRegistry,
  syncModelRegistry,
} from "@blindspot/core";
import { ModelRegistrySyncInputSchema } from "@blindspot/shared";
import type { Env } from "../types";

/** Project-scoped provider discovery and per-route technical compatibility. */
export const modelRegistryRouter = new Hono<Env>();

modelRegistryRouter.get("/model-registry", async (c) => {
  return c.json(await listModelRegistry(c.get("projectId")));
});

modelRegistryRouter.post("/model-registry/sync", async (c) => {
  const parsed = ModelRegistrySyncInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: { message: parsed.error.issues[0]?.message ?? "invalid provider" } }, 400);
  }
  try {
    return c.json({ sync: await syncModelRegistry(c.get("projectId"), parsed.data.provider) });
  } catch (error) {
    if (error instanceof MissingProviderKeyError) {
      return c.json({ error: { message: error.message } }, 409);
    }
    console.error(
      `[gateway] ${parsed.data.provider} registry sync failed:`,
      "provider_or_storage_failure",
    );
    return c.json({ error: { message: `${parsed.data.provider} model sync failed` } }, 502);
  }
});

modelRegistryRouter.get("/routes/:name/model-compatibility", async (c) => {
  const result = await getRouteModelCompatibility(c.get("projectId"), c.req.param("name"));
  if (!result) return c.json({ error: { message: "route not found" } }, 404);
  return c.json(result);
});
