import { randomUUID } from 'node:crypto';
import { getSql } from './client';
import { requireExecution } from './execution';
const direct=['api_keys','provider_keys','model_registry','routes','workflows','beta_feedback','eval_plans','traces','execution_feedback'];
const viaRoute=['candidates','golden_sets','eval_runs','recommendations','drift_events'];
const rows=[
 'SELECT t.id AS project_id,pg_column_size(t)::bigint AS bytes FROM blindspot.projects t',
 ...direct.map(t=>`SELECT t.project_id,pg_column_size(t)::bigint AS bytes FROM blindspot.${t} t`),
 ...viaRoute.map(t=>`SELECT r.project_id,pg_column_size(t)::bigint AS bytes FROM blindspot.${t} t JOIN blindspot.routes r ON r.id=t.route_id`),
 'SELECT r.project_id,pg_column_size(t)::bigint AS bytes FROM blindspot.golden_examples t JOIN blindspot.golden_sets g ON g.id=t.golden_set_id JOIN blindspot.routes r ON r.id=g.route_id',
 'SELECT r.project_id,pg_column_size(t)::bigint AS bytes FROM blindspot.eval_example_results t JOIN blindspot.eval_runs e ON e.id=t.eval_run_id JOIN blindspot.routes r ON r.id=e.route_id',
 ...['workflow_nodes','workflow_executions'].map(t=>`SELECT w.project_id,pg_column_size(t)::bigint AS bytes FROM blindspot.${t} t JOIN blindspot.workflows w ON w.id=t.workflow_id`),
 'SELECT w.project_id,pg_column_size(t)::bigint AS bytes FROM blindspot.workflow_spans t JOIN blindspot.workflow_executions e ON e.id=t.execution_id JOIN blindspot.workflows w ON w.id=e.workflow_id',
];
export class StorageLimitError extends Error {constructor(){super('Workspace storage capacity is reached. Preserve or export existing evidence before adding more.');}}
/** Short admission transaction accounts for concurrent writes; no connection spans external work. */
export async function admitStorage(bytes:number):Promise<string>{
 const actor=requireExecution(),id=randomUUID();if(!Number.isSafeInteger(bytes)||bytes<0||bytes>8*1024*1024)throw new StorageLimitError();
 await getSql().begin(async sql=>{
  await sql`SELECT pg_advisory_xact_lock(8177303)`;
  await sql`DELETE FROM blindspot.storage_admissions WHERE expires_at<now()`;
  const [sum]=await sql.unsafe(`WITH objects AS (${rows.join(' UNION ALL ')}) SELECT coalesce(sum(bytes) FILTER(WHERE project_id=$1),0)::bigint AS own,coalesce(sum(bytes),0)::bigint AS total,count(*) FILTER(WHERE project_id=$1)::int AS records FROM objects`,[actor.projectId]);
  const [pending]=await sql`SELECT coalesce(sum(bytes) FILTER(WHERE project_id=${actor.projectId}),0)::bigint AS own,coalesce(sum(bytes),0)::bigint AS total,count(*)::int AS active FROM blindspot.storage_admissions`;
  if(Number(sum!.own)+Number(pending!.own)+bytes>32*1024*1024||Number(sum!.total)+Number(pending!.total)+bytes>256*1024*1024||Number(sum!.records)>15000||Number(pending!.active)>=16)throw new StorageLimitError();
  await sql`INSERT INTO blindspot.storage_admissions(id,project_id,bytes,expires_at) VALUES(${id},${actor.projectId},${bytes},now()+interval '10 minutes')`;
 });
 return id;
}
export async function releaseStorage(id:string){const actor=requireExecution();await getSql()`DELETE FROM blindspot.storage_admissions WHERE id=${id} AND project_id=${actor.projectId}`;}
