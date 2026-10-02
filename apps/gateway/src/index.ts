import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getDb, traces,databaseReady,fixtureMode,getSql,admitStorage,releaseStorage,StorageLimitError } from "@blindspot/db";
import { checkModelKeyConfig,getDataControls,redactSecrets } from "@blindspot/core";
import { parseModelRef, runChat } from "@blindspot/providers";
import {
  ChatCompletionRequestSchema,
  DEFAULT_GATEWAY_PORT,
  ROUTE_PREFIX,
  loadRootEnv,
} from "@blindspot/shared";
import { requireProject } from "./auth";
import { providerCredential } from "./keys";
import { approvals } from "./manage/approvals";
import { driftRouter } from "./manage/drift";
import { evalRouter } from "./manage/eval";
import { feedbackRouter } from "./manage/feedback";
import { golden } from "./manage/golden";
import { keysRouter } from "./manage/keys";
import { metaRouter } from "./manage/meta";
import { modelRegistryRouter } from "./manage/model-registry";
import { monitorRouter } from "./manage/monitor";
import { routesRouter } from "./manage/routes";
import { workflowsRouter } from "./manage/workflows";
import { examplesRouter } from './manage/examples';
import { publicSignupRouter } from "./public/signup";
import { resolveOrCreateRoute } from "./route-resolver";
import type { Env } from "./types";

loadRootEnv(import.meta.url);

// FMEA P2 (config drift): warn at startup if a configured model has no key in env,
// instead of failing silently at first traffic. Never crashes — warnings only.
for (const w of checkModelKeyConfig()) {
  console.warn(`[gateway] config warning: ${w.message}`);
}

const app = new Hono<Env>();
app.onError((_error,c)=>{console.error('[gateway] request failed');return c.json({error:{message:'The request could not be completed.'}},500);});

// Liveness + connector compatibility probe (no secrets, no auth).
app.get("/healthz", async (c) => {
  try {if(!fixtureMode())await databaseReady();return c.json({
    ok: true,
    service: "gateway",
    apiVersion: "0.1.0",
    auth:!fixtureMode(),mock:process.env.BLINDSPOT_MOCK_MODE==='1',
    features: ["workflow-spans-v2", "beta-feedback", "credentials-auth", "monitor-v1"],
  });}catch{return c.json({ok:false},503);}
});

// Recipient/project-bound signed invitations are the only unauthenticated write surface.
if(fixtureMode())app.route("/public/v1", publicSignupRouter);

// Everything under /v1 requires a project key.
app.use(
  "/v1/*",
  bodyLimit({
    maxSize: 6 * 1024 * 1024,
    onError: (c) => c.json({ error: { message: "request body exceeds the 6 MB limit" } }, 413),
  }),
);
app.use("/v1/*", requireProject);
app.use('/v1/*',async(c,next)=>{
  if(fixtureMode()||['GET','HEAD','DELETE'].includes(c.req.method))return next();
  const body=await c.req.raw.clone().text();
  if(Buffer.byteLength(body,'utf8')>512*1024&&!c.req.path.endsWith('/ingest/spans'))return c.json({error:{message:'The combined request must be at most 512 KiB.'}},413);
  let admission:string;
  try{admission=await admitStorage(Math.min(8*1024*1024,Math.max(65536,Buffer.byteLength(body,'utf8')*3)+(c.req.path.endsWith('/run')?4*1024*1024:0)));}
  catch(error){if(error instanceof StorageLimitError)return c.json({error:{message:error.message}},429);throw error;}
  try{await next();}finally{await releaseStorage(admission);}
});

// Management surface (routes, golden sets, candidates + evals, approvals, keys, …).
app.route("/v1", metaRouter);
app.route("/v1", routesRouter);
app.route("/v1", keysRouter);
app.route("/v1", golden);
app.route("/v1", evalRouter);
app.route("/v1", feedbackRouter);
app.route("/v1", approvals);
app.route("/v1", driftRouter);
app.route("/v1", workflowsRouter);
app.route("/v1", modelRegistryRouter);
app.route("/v1", monitorRouter);
app.route('/v1',examplesRouter);

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
    process.env.BLINDSPOT_DEFAULT_MODEL ?? "openai:gpt-4o-mini";
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
  const credential = await providerCredential(projectId, provider);
  if (!credential) {
    return c.json({ error: { message: `no ${provider} key configured for this project` } }, 400);
  }
  if(credential.shared&&!['openai:gpt-4o-mini','openai:gpt-4o'].includes(modelRef)&&process.env.BLINDSPOT_MOCK_MODE!=='1'&&!fixtureMode())return c.json({error:{message:'Choose a supported configured model.'}},400);
  // Reserve bounded trace capacity before any potentially billed provider dispatch.
  if(!fixtureMode()){
    const count=(await getSql()`SELECT count(*)::int AS n FROM blindspot.traces WHERE project_id=${projectId}`)[0]!.n;
    if(Number(count)>=2000)return c.json({error:{message:'Workspace trace capacity is reached.'}},429);
  }

  // make the real provider call
  let result;
  try {
    result = await runChat({
      modelRef,
      apiKey:credential.key,
      shared:credential.shared,
      messages: body.messages,
      temperature: body.temperature,
      maxTokens: body.max_tokens,
    });
  } catch (err) {
    return c.json({ error: { message: 'Provider completion was not completed. Check usage before trying again.' } }, 502);
  }

  // trace the call (Observe step, PRD §6) — best-effort: a trace failure must never
  // discard a completion the user already paid the provider for.
  try {
    const controls=await getDataControls(projectId);
    await getDb().insert(traces).values({
      projectId,
      routeId,
      model: modelRef,
      input: controls?.captureMode==='full'||controls?.captureMode==='inputs'?redactSecrets(body.messages):{unavailable:true,reason:'metadata capture'},
      output: controls?.captureMode==='full'?String(redactSecrets(result.text)):null,
      costCents: result.costCents,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    console.error("[gateway] trace persistence failed; authoritative usage remains recorded");
  }

  // respond in OpenAI's shape (+ a _blindspot debug block)
  return c.json({
    id: `chatcmpl_${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelRef,
    choices: [
      { index: 0, message: { role: "assistant", content: result.text }, finish_reason: result.finishReason === "content-filter" ? "content_filter" : result.finishReason ?? "stop" },
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
serve({ fetch: app.fetch, port,hostname:process.env.HOST??'127.0.0.1' }, (info) => {
  console.log(`[gateway] listening on http://localhost:${info.port}`);
});
