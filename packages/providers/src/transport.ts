import { fixtureMode, requireExecution } from "@blindspot/db";

const HOSTS = new Set(["api.openai.com", "api.anthropic.com", "generativelanguage.googleapis.com", "api.groq.com", "router.huggingface.co", "huggingface.co", "api.fireworks.ai"]);
export const MAX_PROVIDER_RESPONSE_BYTES = 4 * 1024 * 1024;
export function providerTimeoutSignal(): AbortSignal {
  const value = Number(process.env.PROVIDER_TIMEOUT_MS ?? 60_000);
  return AbortSignal.timeout(Number.isFinite(value) && value >= 1_000 ? Math.min(value, 120_000) : 60_000);
}
export function providerMockMode() {
  if (!fixtureMode()) requireExecution();
  return process.env.BLINDSPOT_MOCK_MODE === "1";
}
export function assertProviderNetwork() {
  if (process.env.BLINDSPOT_MOCK_MODE === "1") throw new Error("Provider network is disabled in sample mode");
  if (!fixtureMode() && requireExecution().mode !== "live") throw new Error("Prepared examples cannot call a provider");
}
/** Fixed provider origins, no credential-bearing redirects; total deadline also bounds body reads. */
export async function boundedProviderFetch(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
  assertProviderNetwork();
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname) || url.port || url.username || url.password || url.hash) throw new Error("Provider origin is not allowed");
  const headers = new Headers(request.headers);
  headers.set("accept-encoding", "identity");
  const response = await fetch(request, { headers, redirect: "error", signal: AbortSignal.any([request.signal, providerTimeoutSignal()]) });
  const encoding = response.headers.get("content-encoding");
  if (encoding && !["identity", "gzip", "deflate", "br"].includes(encoding.trim().toLowerCase())) { await response.body?.cancel(); throw new Error("Unexpected provider response encoding"); }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_PROVIDER_RESPONSE_BYTES) { await response.body?.cancel(); throw new Error("Provider response exceeds limit"); }
  // Node fetch exposes decompressed bytes even when Content-Encoding is retained.
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  if (reader) {
    try {
      while (true) {
        const item = await reader.read(); if (item.done) break;
        bytes += item.value.byteLength;
        if (bytes > MAX_PROVIDER_RESPONSE_BYTES) throw new Error("Provider response exceeds limit");
        chunks.push(item.value);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  }
  const body = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  const cleanHeaders = new Headers(response.headers);
  for (const key of ["content-encoding", "content-length", "transfer-encoding"]) cleanHeaders.delete(key);
  return new Response(body, { status: response.status, statusText: response.statusText, headers: cleanHeaders });
}
