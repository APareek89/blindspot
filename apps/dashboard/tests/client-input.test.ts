import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTION_PAYLOAD_BYTES, boundedAction, validDraftCount } from "../lib/client-input";
test("serialized JSON escaping and UTF-8 bytes count toward the cap before dispatch", async () => {
  let calls=0; const action=async()=>{calls++;return {ok:true as const};};
  const escaped=await boundedAction(['"'.repeat(300_000)],action);
  const unicode=await boundedAction(['🙂'.repeat(140_000)],action);
  assert.equal(escaped.ok,false); assert.equal(unicode.ok,false); assert.equal(calls,0);
});
test("exact serialized byte boundary passes; next byte rejects with actionable copy", async () => {
  let calls=0;const action=async()=>{calls++;return {ok:true as const};};
  assert.deepEqual(await boundedAction("a".repeat(ACTION_PAYLOAD_BYTES-2),action),{ok:true});
  const rejected=await boundedAction("a".repeat(ACTION_PAYLOAD_BYTES-1),action);
  assert.equal(rejected.ok,false); assert.equal(calls,1);
  if(!rejected.ok)assert.match(rejected.error,/512 KiB.*Reduce/);
});
test("draft count accepts only whole values within the reviewed 20-example cap",()=>{
  assert.equal(validDraftCount(1),true);assert.equal(validDraftCount(20),true);
  for(const value of [0,21,50,1.5,NaN,Infinity])assert.equal(validDraftCount(value),false);
});
