import { randomUUID } from "node:crypto";
import { getSql } from "./client";
import { assertExecutionActive, fixtureMode, requireExecution } from "./execution";

export type DispatchPricing = { inputUsdPerMillion: number; outputUsdPerMillion: number; cachedInputUsdPerMillion?: number };
export type ReserveDispatch = { kind: "chat" | "judge" | "golden"; modelRef: string; inputBytes: number; maxOutputTokens: number; shared: boolean; pricing: DispatchPricing };
function cap(name: string, fallback: number) {
  const v = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(v) || v <= 0 || v > 100) throw new Error("Invalid application budget");
  return v;
}
export async function reserveDispatch(input: ReserveDispatch): Promise<string> {
  if (fixtureMode()) return "fixture";
  const actor = await assertExecutionActive();
  if (actor.mode !== "live") throw new Error("Prepared examples cannot call a provider");
  if (![input.inputBytes, input.maxOutputTokens].every(Number.isInteger) || input.inputBytes<0 || input.inputBytes>200000 || input.maxOutputTokens<1 || input.maxOutputTokens>8192) throw new Error("Provider input exceeds the application limit");
  if (![input.pricing.inputUsdPerMillion,input.pricing.outputUsdPerMillion,input.pricing.cachedInputUsdPerMillion ?? 0].every(x=>Number.isFinite(x)&&x>=0)) throw new Error("Verified model pricing is required");
  const reserved = ((input.inputBytes+512)*input.pricing.inputUsdPerMillion + input.maxOutputTokens*input.pricing.outputUsdPerMillion)/1e6;
  const id = randomUUID();
  await getSql().begin(async sql => {
    await sql`SELECT pg_advisory_xact_lock(8177301)`;
    await sql`UPDATE blindspot.usage SET status='released',actual_usd=0,settled_at=now() WHERE status='reserved' AND dispatched_at IS NULL AND created_at<now()-interval '10 minutes'`;
    await sql`UPDATE blindspot.usage SET status='uncertain',settled_at=now() WHERE status='dispatched' AND dispatched_at<now()-interval '10 minutes'`;
    const sums = (await sql`SELECT coalesce(sum(coalesce(actual_usd,reserved_usd)) FILTER(WHERE owner_id=${actor.ownerId}),0)::float AS owner,
      coalesce(sum(coalesce(actual_usd,reserved_usd)) FILTER(WHERE shared),0)::float AS shared,
      count(*) FILTER(WHERE status IN ('reserved','dispatched') AND owner_id=${actor.ownerId})::int AS active_owner,
      count(*) FILTER(WHERE status IN ('reserved','dispatched'))::int AS active_global,
      count(*) FILTER(WHERE owner_id=${actor.ownerId})::int AS records
      FROM blindspot.usage WHERE status!='released'`)[0]!;
    if (Number(sums.owner)+reserved>cap("BLINDSPOT_OWNER_BUDGET_USD",0.25) || (input.shared&&Number(sums.shared)+reserved>cap("BLINDSPOT_SHARED_BUDGET_USD",2))) throw new Error("Application provider budget is exhausted");
    if (sums.active_owner>=2 || sums.active_global>=4 || sums.records>=1000) throw new Error("Provider capacity is busy");
    await sql`INSERT INTO blindspot.usage(id,owner_id,project_id,auth_kind,auth_id,kind,model_ref,shared,reserved_usd,pricing)
      VALUES(${id},${actor.ownerId},${actor.projectId},${actor.authKind},${actor.authId},${input.kind},${input.modelRef},${input.shared},${reserved},${JSON.stringify(input.pricing)}::jsonb)`;
  });
  return id;
}
export async function markDispatched(id: string) {
  if (fixtureMode() && id === "fixture") return;
  const actor = requireExecution();
  try { await assertExecutionActive(actor); }
  catch (error) { await failDispatch(id, { dispatched: false }); throw error; }
  const rows=await getSql()`UPDATE blindspot.usage SET status='dispatched',dispatched_at=now() WHERE id=${id} AND owner_id=${actor.ownerId} AND project_id=${actor.projectId} AND auth_id=${actor.authId} AND status='reserved' RETURNING id`;
  if (!rows.length) throw new Error("Provider reservation is unavailable");
}
export async function settleDispatch(id: string, usage: {inputTokens:number;outputTokens:number;cachedInputTokens?:number}): Promise<number> {
  if (fixtureMode() && id === "fixture") return 0;
  const actor = requireExecution();
  if (![usage.inputTokens,usage.outputTokens,usage.cachedInputTokens ?? 0].every(x=>Number.isSafeInteger(x)&&x>=0) || (usage.cachedInputTokens ?? 0)>usage.inputTokens) throw new Error("Provider usage is unavailable");
  return getSql().begin(async sql => {
    const row=(await sql`SELECT pricing FROM blindspot.usage WHERE id=${id} AND owner_id=${actor.ownerId} AND project_id=${actor.projectId} AND auth_id=${actor.authId} AND status='dispatched' FOR UPDATE`)[0];
    if(!row)throw new Error("Provider usage reservation is unavailable");
    const price=row.pricing as DispatchPricing;
    const cached=usage.cachedInputTokens ?? 0;
    const actual=((usage.inputTokens-cached)*price.inputUsdPerMillion+cached*(price.cachedInputUsdPerMillion ?? price.inputUsdPerMillion)+usage.outputTokens*price.outputUsdPerMillion)/1e6;
    await sql`UPDATE blindspot.usage SET status='complete',actual_usd=${actual},input_tokens=${usage.inputTokens},output_tokens=${usage.outputTokens},cached_input_tokens=${cached},settled_at=now() WHERE id=${id} AND owner_id=${actor.ownerId}`;
    return actual;
  }) as Promise<number>;
}
export async function failDispatch(id: string, state: {dispatched:boolean}) {
  if(fixtureMode() && id === "fixture")return;
  const actor=requireExecution();
  if(!state.dispatched)await getSql()`UPDATE blindspot.usage SET status='released',actual_usd=0,settled_at=now() WHERE id=${id} AND owner_id=${actor.ownerId} AND project_id=${actor.projectId} AND auth_id=${actor.authId} AND status='reserved' AND dispatched_at IS NULL`;
  else await getSql()`UPDATE blindspot.usage SET status='uncertain',settled_at=now() WHERE id=${id} AND owner_id=${actor.ownerId} AND project_id=${actor.projectId} AND auth_id=${actor.authId} AND status='dispatched'`;
}
