import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { getDb, getSql, withExecution, type Execution } from "@blindspot/db";
import { runChat, runStructured } from "@blindspot/providers";
import { z } from "zod";

// Real isolated PostgreSQL + actual SDK serialization; transport is replaced before any call.
async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(database.pathname, "/blindspot_auth_test");
  assert.ok(["127.0.0.1", "localhost"].includes(database.hostname));
  assert.equal(process.env.BLINDSPOT_AUTH_ENABLED, "1");
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.BLINDSPOT_MOCK_MODE, "0");
  const actor = JSON.parse(readFileSync(process.env.BLINDSPOT_TEST_ACTORS_FILE!, "utf8")).A as Execution;
  getDb(); // Exercise the same shared postgres-js serializers as a long-lived gateway.
  const sql = getSql(); const nativeFetch = globalThis.fetch;
  const before = await sql`SELECT id FROM blindspot.usage`;
  const known = new Set(before.map(row => row.id));
  let dispatches = 0; let ambiguous = false;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    assert.equal(request.url, "https://api.openai.com/v1/chat/completions");
    dispatches++;
    if (ambiguous) throw new TypeError("Synthetic connection ended after dispatch");
    const body = await request.json(); assert.equal(body.response_format.type, "json_schema");
    return Response.json({ id: "chatcmpl-ledger-fixture", object: "chat.completion", created: 1,
      model: "gpt-4o-mini", choices: [{ index: 0, message: { role: "assistant", content: "malformed JSON" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 20, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 5 } } });
  };
  try {
    await withExecution(actor, () => assert.rejects(runStructured({ kind: "judge", modelRef: "openai:gpt-4o-mini", apiKey: "synthetic",
      prompt: "Synthetic fixture", schema: z.object({ score: z.number() }), maxTokens: 64, mockValue: () => ({ score: 1 }) }), /no automatic retry/));
    assert.equal(dispatches, 1);
    let added = (await sql`SELECT * FROM blindspot.usage`).filter(row => !known.has(row.id));
    assert.equal(added.length, 1); const complete = added[0]!;
    assert.equal(complete.owner_id, actor.ownerId); assert.equal(complete.project_id, actor.projectId);
    assert.equal(complete.status, "complete"); assert.equal(complete.input_tokens, 20); assert.equal(complete.output_tokens, 4);
    assert.equal(complete.cached_input_tokens, 5);
    assert.ok(Math.abs(Number(complete.actual_usd) - (15 * .15 + 5 * .075 + 4 * .6) / 1e6) < 1e-12);
    const completeSnapshot = JSON.stringify(complete);
    ambiguous = true;
    await withExecution(actor, () => assert.rejects(runChat({ modelRef: "openai:gpt-4o-mini", apiKey: "synthetic",
      messages: [{ role: "user", content: "Synthetic fixture" }], maxTokens: 64 }), /no automatic retry/));
    assert.equal(dispatches, 2);
    added = (await sql`SELECT * FROM blindspot.usage`).filter(row => !known.has(row.id));
    assert.equal(added.length, 2);
    assert.equal(JSON.stringify(added.find(row => row.id === complete.id)), completeSnapshot);
    const uncertain = added.find(row => row.id !== complete.id)!;
    assert.equal(uncertain.owner_id, actor.ownerId); assert.equal(uncertain.status, "uncertain");
    assert.equal(uncertain.actual_usd, null); assert.ok(Number(uncertain.reserved_usd) > 0); assert.ok(uncertain.dispatched_at);
    const receipt = { status: "passed", checks: ["actual_sdk_malformed_json_keeps_known_usage", "actual_sdk_ambiguous_dispatch_keeps_reservation", "no_automatic_retry", "owner_project_bound", "previous_complete_row_unchanged"], actualPostgres: true, fixtureDispatches: dispatches, realProviderCalls: 0 };
    if (process.env.BLINDSPOT_TEST_RECEIPT) writeFileSync(process.env.BLINDSPOT_TEST_RECEIPT, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify(receipt));
  } finally { globalThis.fetch = nativeFetch; await sql.end({ timeout: 5 }); }
}
void main().catch(error => { console.error(JSON.stringify({ status: "failed", category: error instanceof Error ? error.name : "unknown" })); process.exitCode = 1; });
