import { Hono } from "hono";
import {
  addExample,
  createGoldenSet,
  deleteExample,
  generateGoldenExamples,
  goldenExampleProjectId,
  goldenSetProjectId,
  listExamples,
  listGoldenSets,
  listTraces,
  parseGoldenUpload,
  promoteTrace,
  traceProjectId,
  updateExample,
} from "@blindspot/core";
import { normalizeModelRef, parseModelRef } from "@blindspot/providers";
import {
  DEFAULT_JUDGE_MODEL,
  GoldenGenerateInputSchema,
  GoldenExampleInputSchema,
  GoldenExamplePatchSchema,
} from "@blindspot/shared";
import { providerCredential } from "../keys";
import { getRouteByName } from "../route-resolver";
import type { Env } from "../types";

/** Golden-set management (PRD §7). Mounted under /v1; project auth applied by parent. */
export const golden = new Hono<Env>();

// seed via upload (CSV/JSON/JSONL)
golden.post("/routes/:name/golden-sets/upload", async (c) => {
  const route = await getRouteByName(c.get("projectId"), c.req.param("name"));
  if (!route) return c.json({ error: { message: "route not found" } }, 404);

  const body = (await c.req.json().catch(() => null)) as
    | { format?: string; data?: string }
    | null;
  if (
    !body?.data ||
    (body.format !== "csv" && body.format !== "json" && body.format !== "jsonl")
  ) {
    return c.json(
      { error: { message: "expected { format: 'csv'|'json'|'jsonl', data: string }" } },
      400,
    );
  }

  let examples;
  try {
    examples = parseGoldenUpload(body.format, body.data);
  } catch (e) {
    return c.json({ error: { message: (e as Error).message } }, 400);
  }
  const gs = await createGoldenSet({ routeId: route.id, origin: "upload", examples });
  return c.json({ golden_set: gs, count: examples.length });
});

// seed via the Golden Set Agent
golden.post("/routes/:name/golden-sets/generate", async (c) => {
  const projectId = c.get("projectId");
  const route = await getRouteByName(projectId, c.req.param("name"));
  if (!route) return c.json({ error: { message: "route not found" } }, 404);

  const parsed = GoldenGenerateInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: { message: parsed.error.issues[0]?.message ?? "invalid context" } }, 400);
  }
  const body = parsed.data;
  const taskDescription = body.taskDescription || `Requests routed through "${route.name}"`;
  const count = body.count;

  const modelRef = normalizeModelRef(
    process.env.GOLDEN_MODEL ?? process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL,
  );
  const { provider } = parseModelRef(modelRef);
  const credential = await providerCredential(projectId, provider);
  const apiKey=credential?.key;
  if (!apiKey) {
    return c.json(
      { error: { message: `no ${provider} key configured for golden generation` } },
      400,
    );
  }

  let generated;
  try {
    const liveTraces = body.useLiveTraces
      ? (await listTraces(projectId, { routeName: route.name, limit: 20 })).traces
      : [];
    const sampleInputs = liveTraces
      .map((trace) => {
        if (typeof trace.input === "string") return trace.input;
        try {
          return JSON.stringify(trace.input);
        } catch {
          return "";
        }
      })
      .filter((value) => value && !value.includes('"unavailable":true'));
    generated = await generateGoldenExamples({
      modelRef,
      apiKey,
      shared:credential!.shared,
      taskDescription,
      productBrief: body.productBrief,
      systemPrompt: body.systemPrompt,
      architecture: body.architecture,
      count,
      sampleInputs,
    });
  } catch (e) {
    return c.json(
      { error: { message: "Golden-set generation failed; verify the provider key and context" } },
      502,
    );
  }

  const gs = await createGoldenSet({
    routeId: route.id,
    origin: "agent",
    examples: generated.map((g) => ({
      input: g.input,
      referenceOutput: g.referenceOutput,
      rubric: g.rubric,
      label: "unlabeled" as const,
    })),
  });
  return c.json({ golden_set: gs, count: generated.length });
});

golden.get("/routes/:name/golden-sets", async (c) => {
  const route = await getRouteByName(c.get("projectId"), c.req.param("name"));
  if (!route) return c.json({ error: { message: "route not found" } }, 404);
  return c.json({ golden_sets: await listGoldenSets(route.id) });
});

golden.get("/golden-sets/:id/examples", async (c) => {
  const id = c.req.param("id");
  if ((await goldenSetProjectId(id)) !== c.get("projectId")) {
    return c.json({ error: { message: "golden set not found" } }, 404);
  }
  return c.json({ examples: await listExamples(id) });
});

golden.post("/golden-sets/:id/examples", async (c) => {
  const id = c.req.param("id");
  if ((await goldenSetProjectId(id)) !== c.get("projectId")) {
    return c.json({ error: { message: "golden set not found" } }, 404);
  }
  const parsed = GoldenExampleInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { message: parsed.error.message } }, 400);
  return c.json({ example: await addExample(id, parsed.data) });
});

golden.patch("/golden-examples/:id", async (c) => {
  const id = c.req.param("id");
  if ((await goldenExampleProjectId(id)) !== c.get("projectId")) {
    return c.json({ error: { message: "example not found" } }, 404);
  }
  const parsed = GoldenExamplePatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { message: parsed.error.message } }, 400);
  if (Object.keys(parsed.data).length === 0) {
    return c.json({ error: { message: "no fields to update" } }, 400);
  }
  const updated = await updateExample(id, parsed.data);
  if (!updated) return c.json({ error: { message: "example not found" } }, 404);
  return c.json({ example: updated });
});

golden.delete("/golden-examples/:id", async (c) => {
  const id = c.req.param("id");
  if ((await goldenExampleProjectId(id)) !== c.get("projectId")) {
    return c.json({ error: { message: "example not found" } }, 404);
  }
  await deleteExample(id);
  return c.json({ ok: true });
});

golden.post("/golden-sets/:id/promote-trace", async (c) => {
  const projectId = c.get("projectId");
  const id = c.req.param("id");
  if ((await goldenSetProjectId(id)) !== projectId) {
    return c.json({ error: { message: "golden set not found" } }, 404);
  }
  const body = (await c.req.json().catch(() => null)) as { traceId?: string } | null;
  if (!body?.traceId) return c.json({ error: { message: "expected { traceId }" } }, 400);
  if ((await traceProjectId(body.traceId)) !== projectId) {
    return c.json({ error: { message: "trace not found" } }, 404);
  }
  try {
    const example = await promoteTrace({ goldenSetId: id, traceId: body.traceId });
    return c.json({ example });
  } catch (e) {
    return c.json({ error: { message: (e as Error).message } }, 400);
  }
});
