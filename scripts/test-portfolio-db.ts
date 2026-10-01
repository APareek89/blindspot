import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { activeSession,admitStorage,createAccount,createSession,getSql,getDb,markDispatched,reserveDispatch,revokeSession,settleDispatch,failDispatch,releaseStorage,signActor,verifyActor,withExecution,type Execution } from '@blindspot/db';
import { validCsrf } from '../apps/dashboard/lib/security';
const checks:string[]=[];let stage='setup';
async function rejects(name:string,operation:()=>Promise<unknown>){await assert.rejects(operation);checks.push(name);}
const price={inputUsdPerMillion:0.15,outputUsdPerMillion:0.60,cachedInputUsdPerMillion:0.075};
const input={kind:'chat' as const,modelRef:'openai:gpt-4o-mini',inputBytes:100,maxOutputTokens:64,shared:true,pricing:price};
async function main(){
try{
 if(!process.env.DATABASE_URL?.includes('/blindspot_auth_test'))throw new Error('Isolated test database required');
 const a=await createAccount(`db-${randomUUID()}@example.invalid`,'synthetic-unusable-hash');
 const b=await createAccount(`db-${randomUUID()}@example.invalid`,'synthetic-unusable-hash');
 let sid=await createSession(a.id);const sidB=await createSession(b.id);
 const actor=():Execution=>({ownerId:a.id,projectId:a.projectId,authKind:'session',authId:sid,mode:'live'});
 const actorB:Execution={ownerId:b.id,projectId:b.projectId,authKind:'session',authId:sidB,mode:'live'};
 stage='session';assert(await activeSession(a.id,sid));assert.equal(await activeSession(b.id,sid),null);checks.push('session_owner_binding');
 stage='malformed_tokens';assert.equal(await verifyActor(`e30.${'ü'.repeat(43)}`,'POST','/v1/x',''),null);assert.equal(validCsrf(`e30.${'ü'.repeat(43)}`,'x'),false);checks.push('unicode_signatures_fail_closed');
 const human=(await activeSession(a.id,sid))!;const token=signActor(human,'POST','/v1/test','{}');
 assert.equal(await verifyActor(token,'GET','/v1/test','{}'),null);assert.equal(await verifyActor(token,'POST','/v1/test','{"x":1}'),null);assert(await verifyActor(token,'POST','/v1/test','{}'));assert.equal(await verifyActor(token,'POST','/v1/test','{}'),null);checks.push('bridge_method_body_and_replay_binding');
 getDb();assert(await verifyActor(signActor(human,'GET','/v1/after-orm',''),'GET','/v1/after-orm',''));checks.push('bridge_timestamp_after_drizzle_initialization');
 stage='usage';await rejects('missing_actor_denied',()=>reserveDispatch(input));
 await withExecution(actor(),async()=>{const id=await reserveDispatch(input);await revokeSession(a.id,sid);await rejects('revocation_before_dispatch_denied',()=>markDispatched(id));const row=(await getSql()`SELECT status,actual_usd,dispatched_at FROM blindspot.usage WHERE id=${id} AND owner_id=${a.id}`)[0]!;assert.equal(row.status,'released');assert.equal(Number(row.actual_usd),0);assert.equal(row.dispatched_at,null);checks.push('undispatched_capacity_released');});
 sid=await createSession(a.id);
 await withExecution(actor(),async()=>{const id=await reserveDispatch(input);await markDispatched(id);await withExecution(actorB,()=>rejects('foreign_usage_settlement_denied',()=>settleDispatch(id,{inputTokens:20,outputTokens:3})));
  const actual=await settleDispatch(id,{inputTokens:20,outputTokens:3,cachedInputTokens:10});assert.equal(actual,(10*.15+10*.075+3*.6)/1e6);await failDispatch(id,{dispatched:true});assert.equal((await getSql()`SELECT status FROM blindspot.usage WHERE id=${id}`)[0]!.status,'complete');checks.push('known_usage_survives_later_failure');});
 await withExecution(actor(),async()=>{const id=await reserveDispatch(input);await markDispatched(id);await failDispatch(id,{dispatched:true});const row=(await getSql()`SELECT status,reserved_usd,actual_usd FROM blindspot.usage WHERE id=${id}`)[0]!;assert.equal(row.status,'uncertain');assert.equal(row.actual_usd,null);assert(Number(row.reserved_usd)>0);checks.push('ambiguous_dispatch_retains_reservation');});
 await withExecution(actor(),async()=>{const before=Number((await getSql()`SELECT count(*)::int AS n FROM blindspot.usage WHERE owner_id=${a.id}`)[0]!.n);const old=process.env.BLINDSPOT_OWNER_BUDGET_USD;process.env.BLINDSPOT_OWNER_BUDGET_USD='0.0000001';try{await rejects('owner_cap_denied_before_insert',()=>reserveDispatch(input));}finally{process.env.BLINDSPOT_OWNER_BUDGET_USD=old;}assert.equal(Number((await getSql()`SELECT count(*)::int AS n FROM blindspot.usage WHERE owner_id=${a.id}`)[0]!.n),before);checks.push('cap_rejection_does_not_drain_shared_ledger');});
 await withExecution(actor(),async()=>{const ids=await Promise.all([reserveDispatch(input),reserveDispatch(input)]);try{await rejects('owner_concurrency_bounded',()=>reserveDispatch(input));}finally{for(const id of ids)await failDispatch(id,{dispatched:false});}});
 await withExecution({...actor(),mode:'prepared'},()=>rejects('prepared_provider_reservation_denied',()=>reserveDispatch(input)));
 stage='storage';await withExecution(actor(),async()=>{const id=await admitStorage(1024);await withExecution(actorB,()=>releaseStorage(id));assert.equal(Number((await getSql()`SELECT count(*)::int AS n FROM blindspot.storage_admissions WHERE id=${id}`)[0]!.n),1);await releaseStorage(id);checks.push('storage_admission_owner_binding');});
 stage='quota';await withExecution(actor(),async()=>{const ids:string[]=[];try{for(let i=0;i<3;i++)ids.push(await admitStorage(8*1024*1024));await rejects('concurrent_storage_bytes_enforce_owner_cap',()=>admitStorage(8*1024*1024));}finally{for(const id of ids)await releaseStorage(id);}const fresh=await admitStorage(1024);await releaseStorage(fresh);checks.push('rejected_storage_write_releases_no_user_data');});
 stage='privilege';await rejects('runtime_cannot_truncate',()=>getSql().unsafe('TRUNCATE blindspot.usage'));await rejects('runtime_cannot_create_table',()=>getSql().unsafe('CREATE TABLE blindspot.forbidden_test(x integer)'));
 writeFileSync('/Users/macbook/Documents/Codex/portfolio/_private/blindspot-test-actors.json',JSON.stringify({A:actor(),B:actorB}),{mode:0o600});
 const receipt={status:'passed',checks,actualPostgres:true,role:'DML only',providerCalls:0};writeFileSync('/Users/macbook/Documents/Codex/portfolio/_verify/blindspot/database-contracts.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify({status:'passed',checks:checks.length,providerCalls:0}));
}catch(error){console.log(JSON.stringify({status:'failed',stage,error:error instanceof Error?error.name:'unknown'}));process.exitCode=1;}finally{await getSql().end({timeout:5});}

}
void main();
