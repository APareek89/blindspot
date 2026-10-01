import bcrypt from 'bcryptjs';
import { createAccount,rateLimit,RateLimitError } from '@blindspot/db';
import { credentials,requestActor } from '@/lib/auth';
import { bodyText,checkOrigin,peer,validCsrf } from '@/lib/security';
export const runtime='nodejs';
export async function POST(req:Request){
 try{checkOrigin(req.headers);const body=JSON.parse(await bodyText(req));const actor=await requestActor(req);
  const sub=actor?`session:${actor.sid}`:'anonymous';
  if(!validCsrf(body.csrf??req.headers.get('x-blindspot-csrf'),sub))return Response.json({error:'Refresh your session and try again.'},{status:403});
  await rateLimit(`signup-ip:${peer(req)}`,10,3600);const input=credentials(body);const hash=await bcrypt.hash(input.password,12);await createAccount(input.email,hash);return Response.json({ok:true},{status:201});
 }catch(error){if(error instanceof RateLimitError)return Response.json({code:'rate_limited',error:error.message},{status:429});const e=error as {code?:string;message?:string};if(e.code==='23505')return Response.json({code:'account_exists',error:'An account already exists for this email.'},{status:409});
  return Response.json({error:e.message?.startsWith('Use a valid')?e.message:'Account request could not be completed.'},{status:e.message?.startsWith('Use a valid')?400:503});}
}
