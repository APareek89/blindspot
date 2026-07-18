import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
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
  const idx = ref.indexOf(":");
  if (idx === -1) {
    throw new Error(`model ref must be "provider:model", got "${ref}"`);
  }
  return { provider: ref.slice(0, idx) as Provider, model: ref.slice(idx + 1) };
}

/** Build a Vercel AI SDK model from a "provider:model" ref + the caller's API key. */
export function getLanguageModel(modelRef: string, apiKey: string) {
  return buildModel(parseModelRef(modelRef), apiKey);
}

/** Build a Vercel AI SDK model from a ref + the caller's (decrypted) API key. */
function buildModel(ref: ModelRef, apiKey: string) {
  switch (ref.provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(ref.model);
    case "openai":
      return createOpenAI({ apiKey })(ref.model);
    case "gemini":
      return createGoogleGenerativeAI({ apiKey })(ref.model);
    case "groq":
      return createGroq({ apiKey })(ref.model);
    case "hf":
      // HuggingFace exposes an OpenAI-compatible router; base URL is overridable.
      return createOpenAI({
        apiKey,
        baseURL: process.env.HF_BASE_URL ?? "https://router.huggingface.co/v1",
      })(ref.model);
    case "fireworks":
      // Fireworks exposes an OpenAI-compatible inference endpoint.
      return createOpenAI({
        apiKey,
        baseURL:
          process.env.FIREWORKS_BASE_URL ?? "https://api.fireworks.ai/inference/v1",
      })(ref.model);
    default:
      throw new Error(`provider "${ref.provider}" is not wired yet`);
  }
}

/** Abort signal that fires after PROVIDER_TIMEOUT_MS (default 60s) so calls can't hang. */
export function providerTimeoutSignal(): AbortSignal {
  const configured = Number(process.env.PROVIDER_TIMEOUT_MS ?? 60_000);
  const timeoutMs =
    Number.isFinite(configured) && configured >= 1_000
      ? Math.min(configured, 120_000)
      : 60_000;
  return AbortSignal.timeout(timeoutMs);
}

export interface RunResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  costCents: number | null;
}

/** Run one chat completion through a provider and report tokens + cost + latency. */
export async function runChat(opts: {
  modelRef: string;
  apiKey: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<RunResult> {
  const ref = parseModelRef(opts.modelRef);
  const model = buildModel(ref, opts.apiKey);

  const started = Date.now();
  const res = await generateText({
    model,
    messages: opts.messages,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    abortSignal: providerTimeoutSignal(),
  });
  const latencyMs = Date.now() - started;

  const promptTokens = res.usage.promptTokens ?? 0;
  const completionTokens = res.usage.completionTokens ?? 0;
  return {
    text: res.text,
    promptTokens,
    completionTokens,
    latencyMs,
    costCents: estimateCostCents(opts.modelRef, promptTokens, completionTokens),
  };
}
