import { createHmac, randomUUID } from "node:crypto";
import { getSql } from "./client";
import { uuid,fixtureMode } from "./execution";

export type SessionActor = { id:string; email:string; sid:string; projectId:string };
export class RateLimitError extends Error {readonly code='RATE_LIMIT';constructor(){super('Too many requests. Please wait.');}}
export function authSecret() {
  const value=process.env.AUTH_SECRET;
  if(!value || value.length<32)throw new Error("Authentication is not configured");
  return value;
}
export async function activeSession(owner:unknown,sid:unknown):Promise<SessionActor|null> {
  try { uuid(owner);uuid(sid); } catch { return null; }
  const rows=await getSql()`SELECT u.id,u.email,s.id AS sid,p.id AS "projectId" FROM blindspot.users u
    JOIN blindspot.sessions s ON s.owner_id=u.id JOIN blindspot.projects p ON p.user_id=u.id
    WHERE u.id=${String(owner)} AND s.id=${String(sid)} AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.disabled
    ORDER BY p.created_at,p.id LIMIT 1`;
  return (rows[0] as SessionActor|undefined) ?? null;
}
export async function createSession(owner:string) {
  const id=randomUUID();uuid(owner);
  await getSql().begin(async sql=>{
    const user=await sql`SELECT id FROM blindspot.users WHERE id=${owner} AND NOT disabled FOR UPDATE`;
    if(!user.length)throw new Error("Account is unavailable");
    await sql`DELETE FROM blindspot.sessions WHERE owner_id=${owner} AND (expires_at<now() OR revoked_at IS NOT NULL)`;
    if(Number((await sql`SELECT count(*)::int AS n FROM blindspot.sessions WHERE owner_id=${owner}`)[0]!.n)>=20)throw new Error("Session capacity is reached");
    await sql`INSERT INTO blindspot.sessions(id,owner_id,expires_at) VALUES(${id},${owner},now()+interval '7 days')`;
  });
  return id;
}
export async function revokeSession(owner:string,sid:string) {
  await getSql()`UPDATE blindspot.sessions SET revoked_at=now() WHERE owner_id=${uuid(owner)} AND id=${uuid(sid)}`;
}
export async function createAccount(email:string,hash:string) {
  const owner=randomUUID();const project=randomUUID();
  await getSql().begin(async sql=>{
    await sql`SELECT pg_advisory_xact_lock(8177302)`;
    if(Number((await sql`SELECT count(*)::int AS n FROM blindspot.users`)[0]!.n)>=1000)throw new Error("Account capacity is reached");
    await sql`INSERT INTO blindspot.users(id,email,password_hash) VALUES(${owner},${email},${hash})`;
    await sql`INSERT INTO blindspot.projects(id,user_id,name,capture_mode) VALUES(${project},${owner},'My project','metadata')`;
  });
  return {id:owner,projectId:project};
}
export async function rateLimit(subject:string,limit:number,seconds:number) {
  const secret=process.env.BLINDSPOT_BRIDGE_SECRET;if(!secret||secret.length<32)throw new Error('Private rate limit configuration is missing');
  const key=createHmac("sha256",secret).update(`blindspot-rate:${subject}`).digest("hex");
  const blocked=await getSql().begin(async sql=>{
    await sql`DELETE FROM blindspot.auth_rates WHERE window_start<now()-interval '2 days'`;
    const row=(await sql`INSERT INTO blindspot.auth_rates(key,window_start,count) VALUES(${key},now(),1)
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN auth_rates.window_start<now()-${seconds}*interval '1 second' THEN 1 ELSE auth_rates.count+1 END,
      window_start=CASE WHEN auth_rates.window_start<now()-${seconds}*interval '1 second' THEN now() ELSE auth_rates.window_start END RETURNING count`)[0]!;
    return Number(row.count)>limit || Number((await sql`SELECT count(*)::int AS n FROM blindspot.auth_rates`)[0]!.n)>20000;
  });
  if(blocked)throw new RateLimitError();
}
export async function databaseReady() {
  const sql=getSql();
  const row=(await sql`SELECT current_database() AS database,current_user AS role,r.rolsuper,r.rolbypassrls,
    (SELECT version FROM blindspot.portfolio_schema LIMIT 1) AS version FROM pg_roles r WHERE r.rolname=current_user`)[0]!;
  if(row.version!==1)throw new Error("Database migration is required");
  if(process.env.NODE_ENV==='production' && process.env.BLINDSPOT_LOCAL_PREVIEW!=='1' && (row.database!=='blindspot'||row.role!=='blindspot'||row.rolsuper||row.rolbypassrls))throw new Error("Database role is unsafe");
  if(!fixtureMode()){
    const [privileges]=await sql`SELECT has_schema_privilege(current_user,'blindspot','CREATE') AS schema_create,
      bool_or(c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS owns_tables,
      bool_or(has_table_privilege(current_user,c.oid,'TRUNCATE')) AS can_truncate
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='blindspot' AND c.relkind='r'`;
    if(privileges?.schema_create||privileges?.owns_tables||privileges?.can_truncate)throw new Error('Database runtime privileges are unsafe');
  }
  return true;
}
