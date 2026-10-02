import { failDispatch, fixtureMode, markDispatched, requireExecution, reserveDispatch, settleDispatch } from "@blindspot/db";
import { pricePerMillion } from "./prices";
import { boundedProviderFetch } from "./transport";

export type CallKind = "chat" | "judge" | "golden";
export type CallScope = { kind: CallKind; modelRef: string; input: unknown; maxOutputTokens: number; shared?: boolean };
export type Usage = { inputTokens: number; outputTokens: number; cachedInputTokens: number };
/** Safe metadata only: provider bodies, headers and credentials are never carried. */
export class ProviderDispatchError extends Error {
  constructor(message: string, public readonly dispatched: boolean, public readonly costCents: number | null) {
    super(message); this.name = "ProviderDispatchError";
  }
}
function knownUsageCost(usage: Usage | null, price: { input: number; output: number; cachedInput?: number }): number | null {
  return usage ? ((usage.inputTokens - usage.cachedInputTokens) * price.input + usage.cachedInputTokens * (price.cachedInput ?? price.input) + usage.outputTokens * price.output) / 10000 : null;
}
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
export function responseUsage(value: unknown): Usage | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, any>;
  const usage = body.usage ?? body.usageMetadata;
  if (!usage) return null;
  const input = usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount;
  const output = usage.completion_tokens ?? usage.output_tokens ?? usage.candidatesTokenCount;
  const cached = usage.prompt_tokens_details?.cached_tokens ?? usage.cache_read_input_tokens ?? usage.cachedContentTokenCount ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  if (![input, output, cached, cacheWrite].every(integer)) return null;
  // Anthropic reports uncached input separately from reads; no cache-write request is enabled.
  if (cacheWrite !== 0) return null;
  const totalInput = usage.input_tokens !== undefined ? input + cached : input;
  if (cached > totalInput) return null;
  return { inputTokens: totalInput, outputTokens: output, cachedInputTokens: cached };
}
export async function meteredCall<T>(scope: CallScope, call: (transport: typeof fetch) => Promise<T>): Promise<{ result: T; usage: Usage }> {
  const actor = fixtureMode() ? null : requireExecution();
  if (actor?.mode === "prepared") throw new Error("Prepared examples cannot call a provider");
  if (!Number.isSafeInteger(scope.maxOutputTokens) || scope.maxOutputTokens < 1 || scope.maxOutputTokens > 8192) throw new Error("Provider output limit must be between1 and8192");
  const inputBytes = Buffer.byteLength(JSON.stringify(scope.input), "utf8");
  if (inputBytes > 128_000) throw new Error("Provider input exceeds128KB");
  if (!fixtureMode() && !["openai:gpt-4o-mini", "openai:gpt-4o", "anthropic:claude-sonnet-4-6", "anthropic:claude-haiku-4-5-20251001"].includes(scope.modelRef)) throw new Error("This provider model is not supported for hosted dispatch");
  const price = pricePerMillion(scope.modelRef);
  if (!price) throw new Error("Verified model pricing is required before dispatch");
  if (!fixtureMode() && (scope.shared ?? true) && !["openai:gpt-4o-mini", "openai:gpt-4o"].includes(scope.modelRef)) throw new Error("Shared provider model is not allowed");
  let id: string | null = null; let attempted = false;
  let dispatched = false; let settled = false; let usage: Usage | null = null;
  const transport: typeof fetch = async (input, init) => {
    if (attempted) throw new Error("Automatic provider retries are disabled");
    attempted = true;
    const request = new Request(input, init);
    if (request.method !== "POST") throw new Error("Inference requires one POST");
    const wireBytes = Buffer.byteLength(await request.clone().text(), "utf8");
    if (wireBytes > 128_000) throw new Error("Provider input exceeds128KB");
    id = await reserveDispatch({ kind: scope.kind, modelRef: scope.modelRef, inputBytes: wireBytes, maxOutputTokens: scope.maxOutputTokens,
      shared: scope.shared ?? true, pricing: { inputUsdPerMillion: price.input, outputUsdPerMillion: price.output, cachedInputUsdPerMillion: price.cachedInput } });
    await markDispatched(id); dispatched = true;
    const response = await boundedProviderFetch(request);
    if (response.ok) {
      try { usage = responseUsage(await response.clone().json()); } catch { /* Retain uncertain reservation if the provider body cannot be read. */ }
      if (usage) { await settleDispatch(id, usage); settled = true; }
    }
    return response;
  };
  try {
    const result = await call(transport);
    if (!usage) throw new Error("Provider returned no verified usage");
    return { result, usage };
  } catch {
    if (id && !settled) await failDispatch(id, { dispatched });
    // Provider error objects can include request headers, keys or full prompts.
    const knownCost = knownUsageCost(usage, price);
    throw new ProviderDispatchError(dispatched ? "Provider request failed; no automatic retry was attempted" : "Provider request was not dispatched", dispatched, dispatched ? knownCost : 0);
  }
}
