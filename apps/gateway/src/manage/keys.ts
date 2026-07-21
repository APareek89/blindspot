import { Hono } from "hono";
import {
  createGatewayKey,
  deleteGatewayKey,
  deleteProviderKey,
  isProvider,
  listGatewayKeys,
  listProviderKeys,
  setProviderKey,
} from "@blindspot/core";
import { ProviderKeyInputSchema } from "@blindspot/shared";
import { z } from "zod";
import type { Env } from "../types";

/**
 * Key management (PRD §10 Settings): mint/list gateway keys, and CRUD BYO provider keys
 * (encrypted at rest — the raw value is NEVER returned by any endpoint). Mounted under /v1.
 */
export const keysRouter = new Hono<Env>();

// --- gateway keys (bs_live_…) --------------------------------------------
keysRouter.get("/keys", async (c) => {
  return c.json({ keys: await listGatewayKeys(c.get("projectId")) });
});

keysRouter.post("/keys", async (c) => {
  // the raw key is returned exactly once, here — it's never stored in plaintext
  const key = await createGatewayKey(c.get("projectId"));
  return c.json({ key }, 201);
});

keysRouter.delete("/keys/:id", async (c) => {
  const id = z.string().uuid().safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: { message: "invalid gateway key id" } }, 400);
  const result = await deleteGatewayKey(c.get("projectId"), id.data);
  if (result === "not_found") return c.json({ error: { message: "gateway key not found" } }, 404);
  if (result === "last_key") {
    return c.json({ error: { message: "mint and verify a replacement before revoking the final key" } }, 409);
  }
  return c.json({ ok: true });
});

// --- BYO provider keys (encrypted) ---------------------------------------
keysRouter.get("/provider-keys", async (c) => {
  return c.json({ provider_keys: await listProviderKeys(c.get("projectId")) });
});

keysRouter.put("/provider-keys/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (!isProvider(provider)) {
    return c.json({ error: { message: `unknown provider "${provider}"` } }, 400);
  }
  const parsed = ProviderKeyInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { message: "expected { value: string }" } }, 400);
  const saved = await setProviderKey(c.get("projectId"), provider, parsed.data.value);
  return c.json({ provider_key: saved }); // { provider, createdAt } — never the value
});

keysRouter.delete("/provider-keys/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (!isProvider(provider)) {
    return c.json({ error: { message: `unknown provider "${provider}"` } }, 400);
  }
  const removed = await deleteProviderKey(c.get("projectId"), provider);
  if (!removed) return c.json({ error: { message: "no key for that provider" } }, 404);
  return c.json({ ok: true });
});
