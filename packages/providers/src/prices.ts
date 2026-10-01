/**
 * Approximate list prices in USD per 1,000,000 tokens (input / output).
 * Used to estimate trace + eval cost. Refine as providers change pricing.
 * Money elsewhere is stored in cents, so this converts at the boundary.
 */
const TABLE: Record<string, { in: number; out: number; cached?: number }> = {
  "anthropic:claude-haiku-4-5-20251001": { in: 1.0, out: 5.0, cached: 0.1 },
  "anthropic:claude-sonnet-4-6": { in: 3.0, out: 15.0, cached: 0.3 },
  "anthropic:claude-3-5-haiku-latest": { in: 0.8, out: 4.0 },
  "anthropic:claude-3-5-haiku-20241022": { in: 0.8, out: 4.0 },
  "anthropic:claude-3-5-sonnet-latest": { in: 3.0, out: 15.0 },
  "gemini:gemini-1.5-flash": { in: 0.075, out: 0.3 },
  "gemini:gemini-1.5-flash-8b": { in: 0.0375, out: 0.15 },
  "gemini:gemini-1.5-pro": { in: 1.25, out: 5.0 },
  "groq:llama-3.1-8b-instant": { in: 0.05, out: 0.08 },
  "groq:llama-3.3-70b-versatile": { in: 0.59, out: 0.79 },
  "openai:gpt-4o-mini": { in: 0.15, out: 0.6, cached: 0.075 },
  "openai:gpt-4o": { in: 2.5, out: 10.0, cached: 1.25 },
};

/** Maintained display estimates; hosted admission separately allows only currently verified models. */
export function pricePerMillion(modelRef: string): { input: number; output: number; cachedInput?: number } | null {
  const price = TABLE[modelRef];
  return price ? { input: price.in, output: price.out, cachedInput: price.cached } : null;
}

/** Estimate cost in USD **cents** for a call, or null if the model is unpriced. */
export function estimateCostCents(
  modelRef: string,
  promptTokens: number,
  completionTokens: number,
  cachedInputTokens = 0,
): number | null {
  const p = TABLE[modelRef];
  if (!p) return null;
  const cached = Math.min(promptTokens, Math.max(0, cachedInputTokens));
  const usd = ((promptTokens - cached) / 1e6) * p.in + (cached / 1e6) * (p.cached ?? p.in) + (completionTokens / 1e6) * p.out;
  return usd * 100;
}

/** Cost per 1k tokens in cents (assumes a 50/50 in/out split), or null. */
export function costPer1kCents(modelRef: string): number | null {
  return estimateCostCents(modelRef, 500, 500);
}
