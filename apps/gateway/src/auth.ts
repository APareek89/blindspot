import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { hashGatewayKey } from "@blindspot/core";
import { apiKeys, getDb,getSql,fixtureMode,verifyActor,withExecution,rateLimit,RateLimitError } from "@blindspot/db";
import type { Env } from "./types";
import { preparedMutation } from './prepared-boundary';

/** Gateway keys are stored only as a sha256 hash — never in plaintext (core is the source). */
export const hashKey = hashGatewayKey;

/** Resolve a bearer key (bs_live_…) to its project id, or null if unknown. */
export async function projectIdForKey(raw: string): Promise<string | null> {
  const rows = await getDb()
    .select({ projectId: apiKeys.projectId })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashKey(raw)))
    .limit(1);
  return rows[0]?.projectId ?? null;
}

/** Hono middleware: require a valid bs_live_ key and stash the project id. */
export const requireProject: MiddlewareHandler<Env> = async (c, next) => {
  if(!fixtureMode()){
    let phase='identity';
    try{
      const url=new URL(c.req.url);const path=url.pathname+url.search;
      const human=c.req.header('x-blindspot-actor');
      if(human){
        const body=c.req.method==='GET'?'':await c.req.raw.clone().text();
        const actor=await verifyActor(human,c.req.method,path,body);
        if(!actor)return c.json({error:{message:'Sign in to continue.'}},401);
        if(await preparedMutation(actor.projectId,c.req.method,url.pathname))return c.json({error:{message:'This prepared example is read-only. Use an ordinary workflow for your experiments.'}},409);
        c.set('projectId',actor.projectId);
        await rateLimit(`owner:${actor.id}:http`,600,900);
        phase='handler';
        return await withExecution({ownerId:actor.id,projectId:actor.projectId,authKind:'session',authId:actor.sid,mode:'live'},async()=>{await next();});
      }
      const match=/^Bearer (bs_live_[0-9a-f]{48})$/.exec(c.req.header('authorization')??'');
      if(!match)return c.json({error:{message:'A valid application key is required.'}},401);
      const row=(await getSql()`SELECT k.id,k.project_id,k.scopes,p.user_id FROM blindspot.api_keys k
        JOIN blindspot.projects p ON p.id=k.project_id JOIN blindspot.users u ON u.id=p.user_id
        WHERE k.key_hash=${hashKey(match[1]!)} AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at>now()) AND NOT u.disabled`)[0];
      if(!row)return c.json({error:{message:'A valid application key is required.'}},401);
      const allowed:Record<string,string>={'POST /v1/chat/completions':'completion','POST /v1/ingest/spans':'telemetry','POST /v1/workflows/resolve-model':'telemetry','POST /v1/workflow-context':'telemetry','POST /v1/feedback':'feedback'};
      const scope=allowed[`${c.req.method} ${url.pathname}`];
      if(!scope||!Array.isArray(row.scopes)||!row.scopes.includes(scope))return c.json({error:{message:'This application key cannot manage the workspace.'}},403);
      c.set('projectId',row.project_id);
      await rateLimit(`owner:${row.user_id}:sdk`,300,900);
      const example= row.scopes.find((scope:string)=>scope.startsWith('prepared:'))?.slice(9);
      phase='handler';
      return await withExecution({ownerId:row.user_id,projectId:row.project_id,authKind:'sdk',authId:row.id,mode:example?'prepared':'live',...(example?{exampleId:example}:{})},async()=>{await next();});
    }catch(error){console.error('[gateway] boundary failure',JSON.stringify({phase,category:error instanceof Error?error.name:'unknown',code:typeof (error as {code?:unknown})?.code==='string'?(error as {code:string}).code:'none'}));if(error instanceof RateLimitError)return c.json({error:{message:error.message}},429);return c.json({error:{message:'Authentication is unavailable.'}},503);}
  }
  const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return c.json({ error: { message: "missing bearer key" } }, 401);
  const projectId = await projectIdForKey(token);
  if (!projectId) return c.json({ error: { message: "invalid key" } }, 401);
  c.set("projectId", projectId);
  await next();
};
