import { test } from "node:test";
import assert from "node:assert/strict";
import { AccountEpoch, readOwned, runOwnedAction } from "../lib/client-epoch";
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test("a delayed minted key is discarded after A signs out and B signs in", async () => {
  const epoch = new AccountEpoch(); epoch.accept("A"); const result = deferred<{ok:true;key:string}>(); let sentOwner = "";
  const request = runOwnedAction(epoch, "A", () => true, owner => { sentOwner = owner; return result.promise; }, () => assert.fail("must not expire B"));
  epoch.accept(null, true); epoch.accept("B"); result.resolve({ok:true,key:"synthetic-once-only-key"});
  assert.equal(sentOwner, "A"); assert.equal(await request, null);
});
test("a queued action from an old rendered workspace never dispatches with B's cookie", async () => {
  const epoch = new AccountEpoch(); epoch.accept("B"); let calls = 0;
  assert.equal(await runOwnedAction(epoch, "A", () => true, async () => { calls++; return {ok:true}; }, () => {}), null); assert.equal(calls,0);
});
test("current-session expiry hides workspace; old-session expiry cannot sign B out", async () => {
  const epoch = new AccountEpoch(); epoch.accept("A"); let expired = 0;
  const stale = deferred<{ok:false;code:string}>();
  const pending = runOwnedAction(epoch, "A", () => true, () => stale.promise, () => { expired++; });
  epoch.accept("B"); stale.resolve({ok:false,code:"AUTH_REQUIRED"}); assert.equal(await pending,null); assert.equal(expired,0);
  assert.equal(await runOwnedAction(epoch, "B", () => true, async () => ({ok:false,code:"AUTH_REQUIRED"}), () => { expired++; epoch.accept(null,true); }),null); assert.equal(expired,1); assert.equal(epoch.owner,null);
});
test("cross-tab account notification invalidates a file read before session refresh", async () => {
  const epoch = new AccountEpoch(); epoch.accept("A"); const file = deferred<string>();
  const read = readOwned(epoch, "A", () => true, () => file.promise);
  epoch.accept(null, true); file.resolve("private fixture A"); assert.equal(await read,null);
});
test("delayed action and file read cannot update an unmounted screen", async () => {
  const epoch = new AccountEpoch(); epoch.accept("A"); let mounted = true; const response = deferred<{ok:true}>(); const file = deferred<string>();
  const action = runOwnedAction(epoch,"A",()=>mounted,()=>response.promise,()=>{}); const read=readOwned(epoch,"A",()=>mounted,()=>file.promise);
  mounted=false; response.resolve({ok:true}); file.resolve("fixture"); assert.equal(await action,null); assert.equal(await read,null);
});
test("same-session refresh preserves pending work, while an action failure stays generic", async () => {
  const epoch=new AccountEpoch();epoch.accept("A"); const value=deferred<{ok:true;plan:string}>();
  const pending=runOwnedAction(epoch,"A",()=>true,()=>value.promise,()=>{}); epoch.accept("A"); value.resolve({ok:true,plan:"reviewed-plan"}); assert.deepEqual(await pending,{ok:true,plan:"reviewed-plan"});
  const failure=await runOwnedAction(epoch,"A",()=>true,async()=>{throw new Error("secret-like-provider-content");},()=>{}); assert.deepEqual(failure,{ok:false,error:"The request was not completed. Please try again."});
});
