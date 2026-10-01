import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, generateObject } from "ai";
import type { z } from "zod";
import { meteredCall } from "./metering";
import { providerTimeoutSignal, providerMockMode } from "./transport";
export { providerTimeoutSignal } from "./transport";
import type { ChatMessage, Provider } from "@blindspot/shared";
import { estimateCostCents } from "./prices";

export { estimateCostCents, costPer1kCents, pricePerMillion } from "./prices";
export * from "./registry";

export interface ModelRef {
  provider: Provider;
  model: string;
}

/** Bare model names (e.g. from a PRD-style JUDGE_MODEL) → canonical provider:model. */
const BARE_ALIASES: Record<string, string> = {
  "gemini-1.5-flash": "gemini:gemini-1.5-flash",
  "gemini-1.5-flash-8b": "gemini:gemini-1.5-flash-8b",
  "gemini-1.5-pro": "gemini:gemini-1.5-pro",
  "claude-haiku": "anthropic:claude-haiku-4-5-20251001",
  "claude-haiku-4-5": "anthropic:claude-haiku-4-5-20251001",
  "claude-sonnet": "anthropic:claude-sonnet-4-6",
};

/** Accept either "provider:model" or a known bare name; return canonical form. */
export function normalizeModelRef(ref: string): string {
  if (ref.includes(":")) return ref;
  return BARE_ALIASES[ref] ?? ref;
}

/** Parse "provider:model" (e.g. "anthropic:claude-haiku-4-5-20251001"). */
export function parseModelRef(ref: string): ModelRef {
  if (typeof ref !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,199}$/.test(ref) || ref.includes("..")) throw new Error("Invalid provider model reference");
  const idx = ref.indexOf(":");
  if (idx === -1) {
    throw new Error(`model ref must be "provider:model", got "${ref}"`);
  }
  return { provider: ref.slice(0, idx) as Provider, model: ref.slice(idx + 1) };
}

/** Build a Vercel AI SDK model from a ref + the caller's (decrypted) API key. */
function buildModel(ref: ModelRef, apiKey: string, transport: typeof fetch) {
  switch (ref.provider) {
    case "anthropic":
      return createAnthropic({ apiKey, fetch: transport })(ref.model);
    case "openai":
      return createOpenAI({ apiKey, fetch: transport })(ref.model, { structuredOutputs: true });
    case "gemini":
      return createGoogleGenerativeAI({ apiKey, fetch: transport })(ref.model);
    case "groq":
      return createGroq({ apiKey, fetch: transport })(ref.model);
    case "hf":
      // Fixed provider endpoint; credentials never follow caller-controlled origins.
      return createOpenAI({
        apiKey, fetch: transport,
        baseURL: "https://router.huggingface.co/v1",
      })(ref.model);
    case "fireworks":
      // Fireworks exposes an OpenAI-compatible inference endpoint.
      return createOpenAI({
        apiKey, fetch: transport,
        baseURL:
          "https://api.fireworks.ai/inference/v1",
      })(ref.model);
    default:
      throw new Error(`provider "${ref.provider}" is not wired yet`);
  }
}

export interface RunResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  costCents: number | null;
  fixture?: true;
}

/** One provider dispatch, budgeted before transport and settled before response validation. */
export async function runChat(opts: {
  modelRef: string; apiKey: string; messages: ChatMessage[]; temperature?: number; maxTokens?: number; shared?: boolean;
}): Promise<RunResult> {
  if (!Array.isArray(opts.messages) || opts.messages.length < 1 || opts.messages.length > 100 || opts.messages.some(m => typeof m.content !== "string" || !["system", "user", "assistant"].includes(m.role))) throw new Error("Only bounded text messages are supported");
  const maxTokens = opts.maxTokens ?? 2048;
  if (providerMockMode()) return { text: `Sample response (no provider call): ${opts.messages.filter(m => m.role === "user").at(-1)?.content.slice(0,240) ?? "Prepared example"}`, promptTokens: 0, completionTokens: 0, latencyMs: 0, costCents: 0, fixture: true };
  const started = Date.now();
  const { result, usage } = await meteredCall({ kind: "chat", modelRef: opts.modelRef, input: opts.messages, maxOutputTokens: maxTokens, shared: opts.shared }, transport =>
    generateText({ model: buildModel(parseModelRef(opts.modelRef), opts.apiKey, transport), messages: opts.messages,
      temperature: opts.temperature, maxTokens, maxRetries: 0, maxSteps: 1, abortSignal: providerTimeoutSignal() }));
  return { text: result.text, promptTokens: usage.inputTokens, completionTokens: usage.outputTokens,
    latencyMs: Date.now() - started, costCents: estimateCostCents(opts.modelRef, usage.inputTokens, usage.outputTokens, usage.cachedInputTokens) };
}

/** Shared path for judge and golden generation; malformed paid output still settles its usage. */
export async function runStructured<T>(opts: {
  kind: "judge" | "golden"; modelRef: string; apiKey: string; prompt: string; schema: z.Schema<T>; maxTokens: number; shared?: boolean; mockValue: () => T;
}) {
  if (providerMockMode()) return { object: opts.schema.parse(opts.mockValue()), promptTokens: 0, completionTokens: 0, costCents: 0, fixture: true };
  const { result, usage } = await meteredCall({ kind: opts.kind, modelRef: opts.modelRef,
    input: { prompt: opts.prompt, schemaDescription: "structured JSON output" }, maxOutputTokens: opts.maxTokens, shared: opts.shared }, transport =>
    generateObject({ model: buildModel(parseModelRef(opts.modelRef), opts.apiKey, transport), schema: opts.schema,
      prompt: opts.prompt, maxTokens: opts.maxTokens, maxRetries: 0, abortSignal: providerTimeoutSignal() }));
  return { object: result.object, promptTokens: usage.inputTokens, completionTokens: usage.outputTokens,
    costCents: estimateCostCents(opts.modelRef, usage.inputTokens, usage.outputTokens, usage.cachedInputTokens) };
}
