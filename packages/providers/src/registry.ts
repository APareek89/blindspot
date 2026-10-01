/**
 * Read-only provider catalog adapters. These endpoints list account-visible models and
 * provider-declared capabilities; they never invoke inference or consume model tokens.
 */
import { z } from "zod";
import {
  ModelCapabilitiesSchema,
  type ModelAvailability,
  type ModelCapabilities,
  type ModelProbeStatus,
  type ModelRegistrySource,
  type RegistryProvider,
} from "@blindspot/shared";
import { pricePerMillion } from "./prices";
import { boundedProviderFetch, providerMockMode } from "./transport";

export interface DiscoveredModel {
  provider: RegistryProvider;
  modelRef: string;
  providerModelId: string;
  displayName: string;
  source: ModelRegistrySource;
  availability: ModelAvailability;
  capabilities: ModelCapabilities;
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  providerCreatedAt: Date | null;
  deprecatedAt: Date | null;
  probeStatus: ModelProbeStatus;
}

export class ProviderRegistryError extends Error {
  constructor(
    public readonly provider: RegistryProvider,
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = "ProviderRegistryError";
  }
}

const SupportSchema = z.object({ supported: z.boolean() });
const AnthropicModelSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().min(1),
  created_at: z.string().datetime().nullable().optional(),
  max_input_tokens: z.number().int().nonnegative().optional(),
  max_tokens: z.number().int().nonnegative().optional(),
  capabilities: z
    .object({
      image_input: SupportSchema.optional(),
      structured_outputs: SupportSchema.optional(),
    })
    .passthrough()
    .optional(),
});
const AnthropicListSchema = z.object({
  data: z.array(AnthropicModelSchema),
  has_more: z.boolean().default(false),
  last_id: z.string().nullable().optional(),
});

const OpenAIModelListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      created: z.number().int().nonnegative().optional(),
    }),
  ),
});

const HuggingFaceModelSchema = z
  .object({
    id: z.string().min(1),
    pipeline_tag: z.string().nullable().optional(),
    tags: z.array(z.string()).default([]),
    createdAt: z.string().datetime().nullable().optional(),
    gated: z.union([z.boolean(), z.literal("auto"), z.literal("manual")]).optional(),
  })
  .passthrough();

function positiveOrNull(value: number | null | undefined): number | null {
  return value != null && value > 0 ? value : null;
}

function anthropicCapabilities(model: z.infer<typeof AnthropicModelSchema>): ModelCapabilities {
  return ModelCapabilitiesSchema.parse({
    inputModalities: model.capabilities?.image_input?.supported ? ["text", "image"] : ["text"],
    outputModalities: ["text"],
    // Current Claude Messages models share these provider-level surfaces. The account Models API
    // supplies model-specific context, image and structured-output claims.
    toolCalling: true,
    structuredOutput: model.capabilities?.structured_outputs?.supported ?? null,
    streaming: true,
    systemMessages: true,
    contextTokens: positiveOrNull(model.max_input_tokens),
    maxOutputTokens: positiveOrNull(model.max_tokens),
  });
}

async function checkedJson(
  provider: RegistryProvider,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const maxCatalogBytes = 5 * 1024 * 1024;
  const configuredTimeout = Number(process.env.PROVIDER_TIMEOUT_MS ?? 60_000);
  const timeoutMs =
    Number.isFinite(configuredTimeout) && configuredTimeout >= 1_000
      ? Math.min(configuredTimeout, 120_000)
      : 60_000;
  let response: Response;
  try {
    response = await boundedProviderFetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ProviderRegistryError(provider, null, `${provider} model catalog is unreachable`);
  }
  if (!response.ok) {
    throw new ProviderRegistryError(
      provider,
      response.status,
      `${provider} model catalog returned ${response.status}`,
    );
  }
  const advertisedBytes = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertisedBytes) && advertisedBytes > maxCatalogBytes) {
    throw new ProviderRegistryError(provider, response.status, `${provider} model catalog is too large`);
  }
  try {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("response body missing");
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxCatalogBytes) {
        await reader.cancel();
        throw new ProviderRegistryError(
          provider,
          response.status,
          `${provider} model catalog is too large`,
        );
      }
      chunks.push(value);
    }
    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch (error) {
    if (error instanceof ProviderRegistryError) throw error;
    throw new ProviderRegistryError(provider, response.status, `${provider} returned invalid JSON`);
  }
}

async function listAnthropic(apiKey: string): Promise<DiscoveredModel[]> {
  const models: z.infer<typeof AnthropicModelSchema>[] = [];
  let afterId: string | undefined;
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ limit: "1000" });
    if (afterId) params.set("after_id", afterId);
    const json = await checkedJson(
      "anthropic",
      `https://api.anthropic.com/v1/models?${params}`,
      {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      },
    );
    const parsed = AnthropicListSchema.safeParse(json);
    if (!parsed.success) {
      throw new ProviderRegistryError("anthropic", 200, "anthropic model catalog shape changed");
    }
    models.push(...parsed.data.data);
    if (!parsed.data.has_more || !parsed.data.last_id) break;
    afterId = parsed.data.last_id;
  }
  return models.map((model) => {
    const modelRef = `anthropic:${model.id}`;
    const price = pricePerMillion(modelRef);
    return {
      provider: "anthropic",
      modelRef,
      providerModelId: model.id,
      displayName: model.display_name,
      source: "provider",
      availability: "available",
      capabilities: anthropicCapabilities(model),
      inputUsdPerMillion: price?.input ?? null,
      outputUsdPerMillion: price?.output ?? null,
      providerCreatedAt: model.created_at ? new Date(model.created_at) : null,
      deprecatedAt: null,
      probeStatus: "verified",
    };
  });
}

async function listFireworks(apiKey: string): Promise<DiscoveredModel[]> {
  const base = "https://api.fireworks.ai/inference/v1".replace(
    /\/+$/,
    "",
  );
  const json = await checkedJson("fireworks", `${base}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const parsed = OpenAIModelListSchema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderRegistryError("fireworks", 200, "fireworks model catalog shape changed");
  }
  return parsed.data.data.map((model) => ({
    provider: "fireworks",
    modelRef: `fireworks:${model.id}`,
    providerModelId: model.id,
    displayName: model.id.split("/").at(-1) ?? model.id,
    source: "provider",
    availability: "available",
    capabilities: ModelCapabilitiesSchema.parse({
      inputModalities: ["text"],
      outputModalities: ["text"],
    }),
    inputUsdPerMillion: null,
    outputUsdPerMillion: null,
    providerCreatedAt: model.created ? new Date(model.created * 1000) : null,
    deprecatedAt: null,
    probeStatus: "verified",
  }));
}

async function listHuggingFace(apiKey: string): Promise<DiscoveredModel[]> {
  const params = new URLSearchParams({
    inference_provider: "all",
    pipeline_tag: "text-generation",
    limit: "100",
    sort: "trendingScore",
  });
  const json = await checkedJson("hf", `https://huggingface.co/api/models?${params}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const parsed = z.array(HuggingFaceModelSchema).safeParse(json);
  if (!parsed.success) {
    throw new ProviderRegistryError("hf", 200, "huggingface model catalog shape changed");
  }
  return parsed.data.map((model) => {
    const conversational = model.tags.includes("conversational");
    return {
      provider: "hf",
      modelRef: `hf:${model.id}`,
      providerModelId: model.id,
      displayName: model.id,
      source: "provider",
      availability: "available",
      capabilities: ModelCapabilitiesSchema.parse({
        inputModalities: ["text"],
        outputModalities: ["text"],
        systemMessages: conversational ? true : null,
      }),
      inputUsdPerMillion: null,
      outputUsdPerMillion: null,
      providerCreatedAt: model.createdAt ? new Date(model.createdAt) : null,
      deprecatedAt: null,
      probeStatus: model.gated ? "unverified" : "verified",
    } satisfies DiscoveredModel;
  });
}

async function listOpenAI(apiKey: string): Promise<DiscoveredModel[]> {
  const json = await checkedJson("openai", "https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${apiKey}` } });
  const parsed = OpenAIModelListSchema.safeParse(json);
  if (!parsed.success) throw new ProviderRegistryError("openai",200,"openai model catalog shape changed");
  return parsed.data.data.filter(m => ["gpt-4o-mini", "gpt-4o"].includes(m.id)).map(m => {
    const modelRef = `openai:${m.id}`; const p = pricePerMillion(modelRef)!;
    return { provider: "openai", modelRef, providerModelId: m.id, displayName: m.id, source: "provider", availability: "available",
      capabilities: ModelCapabilitiesSchema.parse({ inputModalities: ["text", "image"], outputModalities: ["text"],
        toolCalling: true, structuredOutput: true, streaming: true, systemMessages: true, contextTokens: 128000, maxOutputTokens: 16384 }),
      inputUsdPerMillion: p.input, outputUsdPerMillion: p.output, providerCreatedAt: m.created ? new Date(m.created * 1000) : null,
      deprecatedAt: null, probeStatus: "verified" } satisfies DiscoveredModel;
  });
}

export async function listProviderModels(
  provider: RegistryProvider,
  apiKey: string,
): Promise<DiscoveredModel[]> {
  if (providerMockMode()) return provider === "openai" ? ["gpt-4o-mini","gpt-4o"].map(id => ({
    provider: "openai", modelRef: `openai:${id}`, providerModelId: id, displayName: `${id} (sample catalog)`, source: "curated",
    availability: "available", capabilities: ModelCapabilitiesSchema.parse({ inputModalities:["text"], outputModalities:["text"], toolCalling:true, structuredOutput:true, streaming:true, systemMessages:true, contextTokens:128000,maxOutputTokens:16384 }),
    inputUsdPerMillion: pricePerMillion(`openai:${id}`)!.input, outputUsdPerMillion: pricePerMillion(`openai:${id}`)!.output,
    providerCreatedAt:null,deprecatedAt:null,probeStatus:"unverified" })) : [];
  if (provider === "openai") return listOpenAI(apiKey);
  if (provider === "anthropic") return listAnthropic(apiKey);
  if (provider === "fireworks") return listFireworks(apiKey);
  return listHuggingFace(apiKey);
}
