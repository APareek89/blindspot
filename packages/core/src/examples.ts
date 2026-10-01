import { randomUUID } from 'node:crypto';
import { Blindspot } from '@blindspot/sdk';
import { eq,and } from 'drizzle-orm';
import { assertExecutionActive,getDb,getSql,requireExecution,withExecution,workflows,workflowNodes,routes } from '@blindspot/db';
import { mintGatewayKeyMaterial } from './keys/gateway';
import { createGoldenSet,listGoldenSets } from './golden/service';
import { createEvalPlan,runAuthorizedEvalPlan } from './eval/planner';
import type { EvalRuntime } from './eval/runner';

const NAME='Prepared support triage';
const LIVE='openai:gpt-4o-mini';
const CANDIDATE='openai:gpt-4o';
/** Executes the shipped SDK and normal evaluation persistence with fixed, openly labeled fixtures. */
export async function createPreparedExample(){
 const actor=await assertExecutionActive();if(actor.authKind!=='session')throw new Error('Human sign-in is required');
 const claimed=await getSql().begin(async sql=>{
  await sql`SELECT id FROM blindspot.projects WHERE id=${actor.projectId} AND user_id=${actor.ownerId} FOR UPDATE`;
  const existing=(await sql`SELECT * FROM blindspot.example_runs WHERE project_id=${actor.projectId} AND owner_id=${actor.ownerId}`)[0];
  if(existing?.status==='complete')return {done:true,workflowId:String(existing.workflow_id),routeName:String(existing.route_name)};
  if(existing?.status==='running'&&Date.now()-new Date(existing.updated_at).getTime()<120000)throw new Error('The prepared example is being created. Try again shortly.');
  const id=existing?String(existing.workflow_id):randomUUID();
  await sql`INSERT INTO blindspot.example_runs(project_id,owner_id,workflow_id,status) VALUES(${actor.projectId},${actor.ownerId},${id},'running') ON CONFLICT(project_id) DO UPDATE SET status='running',updated_at=now()`;
  return {done:false,workflowId:id,routeName:''};
 });
 if(claimed.done)return {workflowId:claimed.workflowId,routeName:claimed.routeName,prepared:true as const};
 const name=`${NAME} · ${claimed.workflowId}`;
 const key=mintGatewayKeyMaterial(),keyId=randomUUID();
 try{
  return await withExecution({...actor,mode:'prepared',exampleId:claimed.workflowId},async()=>{
   const collision=await getSql()`SELECT id FROM blindspot.routes WHERE project_id=${actor.projectId} AND name=${`${name}@prepared:classify-request`} AND (example_kind IS NULL OR example_kind!='prepared')`;
   if(collision.length)throw new Error('The prepared example name is already in use.');
   await getDb().insert(workflows).values({id:claimed.workflowId,projectId:actor.projectId,name,environment:'prepared',framework:'typescript-sdk',language:'typescript',integrationMode:'observe_only',selected:true,exampleKind:'prepared'}).onConflictDoNothing();
   const saved=(await getDb().select().from(workflows).where(and(eq(workflows.id,claimed.workflowId),eq(workflows.projectId,actor.projectId))))[0];
   if(!saved||saved.name!==name||saved.exampleKind!=='prepared')throw new Error('The prepared workflow could not be reserved.');
   await getSql()`INSERT INTO blindspot.api_keys(id,project_id,prefix,key_hash,expires_at,scopes) VALUES(${keyId},${actor.projectId},${key.prefix},${key.keyHash},now()+interval '5 minutes',${['telemetry',`prepared:${claimed.workflowId}`]})`;
   const errors:string[]=[];
   const sdk=new Blindspot({apiKey:key.key,baseUrl:process.env.BLINDSPOT_INTERNAL_GATEWAY_URL??`http://127.0.0.1:${process.env.PORT??8787}`,
    workflow:name,environment:'prepared',framework:'typescript-sdk',language:'typescript',captureMode:'metadata',integrationMode:'observe_only',flushIntervalMs:60000,onError:()=>errors.push('telemetry_failed')});
   await sdk.observeGeneration({executionId:`prepared-${claimed.workflowId}`,id:`prepared-span-${claimed.workflowId}`,node:'classify-request',provider:'openai',model:'gpt-4o-mini',input:'Prepared fixture: a customer asks how to reset a password.',
    metadata:{provenance:'prepared fixture; no provider call'},requirements:{inputModalities:['text'],outputModalities:['text'],systemMessages:true}},
    async()=>({text:'Prepared response: direct the customer to the password reset link; never request their password.'}),
    result=>({output:result.text,inputTokens:0,outputTokens:0,costCents:0,executionStatus:'completed',executionEndedAt:new Date()}));
   await sdk.flush();if(errors.length)throw new Error('Prepared telemetry could not be stored');
   const node=(await getDb().select().from(workflowNodes).where(eq(workflowNodes.workflowId,claimed.workflowId)))[0];
   if(!node?.routeId)throw new Error('Prepared node was not observed');
   const route=(await getDb().update(routes).set({exampleKind:'prepared'}).where(and(eq(routes.id,node.routeId),eq(routes.projectId,actor.projectId))).returning())[0]!;
   const sets=await listGoldenSets(route.id);
   if(!sets.length)await createGoldenSet({routeId:route.id,origin:'upload',examples:[
    {input:'Prepared fixture: how can I reset my password?',referenceOutput:'Use the password reset link. Never share a password.',rubric:'Give a clear, safe account recovery step.',label:'pass'},
    {input:'Prepared fixture: the reset email did not arrive.',referenceOutput:'Check spam and retry; contact support without sharing credentials.',rubric:'Give a clear next step while protecting credentials.',label:'pass'},
   ]});
   // Prepared catalog eligibility is explicit and never claims a provider account probe.
   await seedPreparedCatalog(actor.projectId);
   const plan=await createEvalPlan(actor.projectId,route.name,{modelRefs:[LIVE,CANDIDATE],budgetUsd:0.25,executionMode:'model_only'});
   const fixture:EvalRuntime={runCandidate:async({input})=>({text:`Prepared comparison response: ${input.includes('did not arrive')?'check spam and contact support':'use the reset link'}; never share credentials.`,promptTokens:0,completionTokens:0,costCents:0,latencyMs:0}),
    judge:async()=>({verdict:{score:0.9,reasoning:'Prepared illustrative judgment; no model was called.',perCriterion:[{criterion:'Safety',score:1},{criterion:'Clarity',score:0.8}]},promptTokens:0,completionTokens:0,costCents:0})};
   await runAuthorizedEvalPlan(actor.projectId,plan.id,true,fixture);
   await getSql()`UPDATE blindspot.example_runs SET status='complete',route_name=${route.name},updated_at=now() WHERE project_id=${actor.projectId} AND owner_id=${actor.ownerId}`;
   return {workflowId:claimed.workflowId,routeName:route.name,prepared:true as const};
  });
 }catch(error){await getSql()`UPDATE blindspot.example_runs SET status='failed',updated_at=now() WHERE project_id=${actor.projectId} AND owner_id=${actor.ownerId}`;throw error;}
 finally{await getSql()`UPDATE blindspot.api_keys SET revoked_at=now() WHERE id=${keyId} AND project_id=${actor.projectId}`;}
}
async function seedPreparedCatalog(projectId:string){
 // The fixed prepared route uses a scoped compatibility exception in model-registry;
 // normal account catalogs and real model access remain unaffected.
 const rows=await getSql()`SELECT id FROM blindspot.routes WHERE project_id=${projectId} AND example_kind='prepared'`;
 for(const row of rows)for(const model of [LIVE,CANDIDATE])await getSql()`INSERT INTO blindspot.candidates(route_id,model_ref,source,enabled) VALUES(${row.id},${model},'api',true) ON CONFLICT(route_id,model_ref) DO NOTHING`;
}
