import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getDb, traces } from "@blindspot/db";
import { checkModelKeyConfig } from "@blindspot/core";
import { parseModelRef, runChat } from "@blindspot/providers";
import {
  ChatCompletionRequestSchema,
  DEFAULT_GATEWAY_PORT,
  ROUTE_PREFIX,
  loadRootEnv,
} from "@blindspot/shared";
import { requireProject } from "./auth";
import { getProviderKey } from "./keys";
import { approvals } from "./manage/approvals";
import { driftRouter } from "./manage/drift";
import { evalRouter } from "./manage/eval";
import { golden } from "./manage/golden";
import { keysRouter } from "./manage/keys";
import { metaRouter } from "./manage/meta";
import { modelRegistryRouter } from "./manage/model-registry";
import { routesRouter } from "./manage/routes";
import { workflowsRouter } from "./manage/workflows";
import { resolveOrCreateRoute } from "./route-resolver";
import type { Env } from "./types";

loadRootEnv(import.meta.url);

// FMEA P2 (config drift): warn at startup if a configured model has no key in env,
// instead of failing silently at first traffic. Never crashes — warnings only.
for (const w of checkModelKeyConfig()) {
  console.warn(`[gateway] config warning: ${w.message}`);
}

const app = new Hono<Env>();

// Liveness probe (no secrets, no auth).
app.get("/healthz", (c) => c.json({ ok: true, service: "gateway" }));

// Everything under /v1 requires a project key.
app.use(
  "/v1/*",
  bodyLimit({
    maxSize: 6 * 1024 * 1024,
    onError: (c) => c.json({ error: { message: "request body exceeds the 6 MB limit" } }, 413),
  }),
);
app.use("/v1/*", requireProject);

// Management surface (routes, golden sets, candidates + evals, approvals, keys, …).
app.route("/v1", metaRouter);
app.route("/v1", routesRouter);
app.route("/v1", keysRouter);
app.route("/v1", golden);
app.route("/v1", evalRouter);
app.route("/v1", approvals);
app.route("/v1", driftRouter);
app.route("/v1", workflowsRouter);
app.route("/v1", modelRegistryRouter);

/**
 * OpenAI-compatible chat completions (PRD §1, §12 Phase 1).
 * Point your app's `base_url` here and set `model` to `route:<name>`.
 */
app.post("/v1/chat/completions", async (c) => {
  const projectId = c.get("projectId");

  const parsed = ChatCompletionRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: { message: "invalid request", detail: parsed.error?.message } }, 400);
  }
  const body = parsed.data;

  // resolve route:<name> → the approved live model (auto-create on first sight)
  const defaultModel =
    process.env.BLINDSPOT_DEFAULT_MODEL ?? "anthropic:claude-sonnet-4-6";
  let modelRef = body.model;
  let routeId: string | null = null;
  if (body.model.startsWith(ROUTE_PREFIX)) {
    const route = await resolveOrCreateRoute(
      projectId,
      body.model.slice(ROUTE_PREFIX.length),
      defaultModel,
    );
    modelRef = route.modelRef;
    routeId = route.id;
  }

  // look up the project's BYO key for the resolved provider
  const { provider } = parseModelRef(modelRef);
  const apiKey = await getProviderKey(projectId, provider);
  if (!apiKey) {
    return c.json({ error: { message: `no ${provider} key configured for this project` } }, 400);
  }

  // make the real provider call
  let result;
  try {
    result = await runChat({
      modelRef,
      apiKey,
      messages: body.messages,
      temperature: body.temperature,
      maxTokens: body.max_tokens,
    });
  } catch (err) {
    return c.json({ error: { message: (err as Error).message } }, 502);
  }

  // trace the call (Observe step, PRD §6) — best-effort: a trace failure must never
  // discard a completion the user already paid the provider for.
  try {
    await getDb().insert(traces).values({
      routeId,
      model: modelRef,
      input: body.messages,
      output: result.text,
      costCents: result.costCents,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    console.error("[gateway] trace write failed:", (err as Error).message);
  }

  // respond in OpenAI's shape (+ a _blindspot debug block)
  return c.json({
    id: `chatcmpl_${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelRef,
    choices: [
      { index: 0, message: { role: "assistant", content: result.text }, finish_reason: "stop" },
    ],
    usage: {
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
      total_tokens: result.promptTokens + result.completionTokens,
    },
    _blindspot: {
      route_id: routeId,
      cost_cents: result.costCents,
      latency_ms: result.latencyMs,
    },
  });
});

const port = Number(process.env.PORT ?? DEFAULT_GATEWAY_PORT);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[gateway] listening on http://localhost:${info.port}`);
});
