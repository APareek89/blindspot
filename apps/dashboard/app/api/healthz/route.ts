import { databaseReady,authSecret } from '@blindspot/db';
import { publicOrigin } from '@/lib/security';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(){
 try{
  publicOrigin();authSecret();if((process.env.BLINDSPOT_BRIDGE_SECRET??'').length<32)throw new Error('Bridge unavailable');await databaseReady();
  const base=process.env.BLINDSPOT_GATEWAY_URL;if(!base)throw new Error('Gateway unavailable');
  const response=await fetch(`${base}/healthz`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});
  const state=await response.json();if(!response.ok||state.ok!==true||state.auth!==true||state.mock!==(process.env.BLINDSPOT_MOCK_MODE==='1'))throw new Error('Gateway not ready');
  return Response.json({ok:true,auth:true,mock:state.mock},{headers:{'cache-control':'no-store'}});
 }catch{return Response.json({ok:false},{status:503,headers:{'cache-control':'no-store'}});}
}
