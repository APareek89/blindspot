import { getSql } from '@blindspot/db';
/** Prepared content stays immutable; edited experiments use ordinary workflows. */
export async function preparedMutation(project:string,method:string,path:string):Promise<boolean>{
 if(method==='GET'||path==='/v1/examples')return false;
 const segments=path.split('/').map(x=>decodeURIComponent(x));const table=segments[2],id=segments[3];
 if(!id)return false;
 const sql=getSql();
 if(table==='routes')return Boolean((await sql`SELECT id FROM blindspot.routes WHERE project_id=${project} AND name=${id} AND example_kind='prepared'`)[0]);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return false;
 if(table==='workflows')return Boolean((await sql`SELECT id FROM blindspot.workflows WHERE project_id=${project} AND id=${id} AND example_kind='prepared'`)[0]);
 if(table==='golden-sets')return Boolean((await sql`SELECT g.id FROM blindspot.golden_sets g JOIN blindspot.routes r ON r.id=g.route_id WHERE g.id=${id} AND r.project_id=${project} AND r.example_kind='prepared'`)[0]);
 if(table==='golden-examples')return Boolean((await sql`SELECT e.id FROM blindspot.golden_examples e JOIN blindspot.golden_sets g ON g.id=e.golden_set_id JOIN blindspot.routes r ON r.id=g.route_id WHERE e.id=${id} AND r.project_id=${project} AND r.example_kind='prepared'`)[0]);
 if(table==='eval-plans')return Boolean((await sql`SELECT p.id FROM blindspot.eval_plans p JOIN blindspot.routes r ON r.id=p.route_id WHERE p.id=${id} AND r.project_id=${project} AND r.example_kind='prepared'`)[0]);
 return false;
}
