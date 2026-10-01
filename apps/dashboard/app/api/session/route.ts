import { randomBytes } from 'node:crypto';
import { requestActor } from '@/lib/auth';
import { csrfToken,parseCookies,setCookie } from '@/lib/security';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 try{const actor=await requestActor(req),cookie=parseCookies(req);
  const anon=/^[a-f0-9]{48}$/.test(cookie.bs_anon??'')?cookie.bs_anon:randomBytes(24).toString('hex');
  const csrf=csrfToken(cookie.bs_csrf,actor?`session:${actor.sid}`:'anonymous');
  const response=Response.json({enabled:true,user:actor?{id:actor.id,email:actor.email}:null,csrf,mode:process.env.BLINDSPOT_MOCK_MODE==='1'?'mock':'live'},{headers:{'cache-control':'no-store'}});
  response.headers.append('set-cookie',setCookie('bs_anon',anon,7*86400));response.headers.append('set-cookie',setCookie('bs_csrf',csrf,48*3600));return response;
 }catch{return Response.json({error:'Session is unavailable.'},{status:503,headers:{'cache-control':'no-store'}});}
}
