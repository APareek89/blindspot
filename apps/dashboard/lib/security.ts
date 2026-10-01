import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { authSecret } from "@blindspot/db";
export class AuthBoundaryError extends Error {
 constructor(public code:"AUTH_REQUIRED"|"SESSION_CHANGED"|"FORBIDDEN",message:string){super(message);}
}
export function publicOrigin(){
 const value=process.env.APP_ORIGIN; if(!value)throw new Error('Application origin is required');
 const url=new URL(value);if(value!==url.origin||!['https:','http:'].includes(url.protocol))throw new Error('Invalid application origin');
 if(process.env.NODE_ENV==='production'&&url.protocol!=='https:'){
  const db=new URL(process.env.DATABASE_URL??'');
  if(process.env.BLINDSPOT_LOCAL_PREVIEW!=='1'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!['localhost','127.0.0.1','[::1]'].includes(db.hostname)||process.env.BLINDSPOT_MOCK_MODE!=='1'||process.env.HOSTNAME!=='127.0.0.1'||['OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','HF_TOKEN','FIREWORKS_API_KEY','GROQ_API_KEY'].some(k=>process.env[k]))throw new Error('HTTPS is required');
 }
 return value;
}
export function secureCookies(){return publicOrigin().startsWith('https:');}
export function checkOrigin(headers:Headers){if(headers.get('origin')!==publicOrigin())throw new AuthBoundaryError('FORBIDDEN','Request origin is not allowed.');}
function sign(value:string){return createHmac('sha256',authSecret()).update(value).digest('base64url');}
export function validCsrf(token:unknown,subject:string){
 if(typeof token!=='string'||token.length>512)return false;const [raw,sig,extra]=token.split('.');
 if(!raw||!sig||extra||!/^[A-Za-z0-9_-]+$/.test(raw)||!/^[A-Za-z0-9_-]{43}$/.test(sig))return false;const expected=sign(raw);if(!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return false;
 try{const body=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'));return body.sub===sign(subject)&&Number.isSafeInteger(body.exp)&&body.exp>Date.now()&&body.exp<Date.now()+49*3600000;}catch{return false;}
}
export function csrfToken(previous:unknown,subject:string){
 if(validCsrf(previous,subject))return previous as string;
 const raw=Buffer.from(JSON.stringify({sub:sign(subject),exp:Date.now()+48*3600000,nonce:randomBytes(24).toString('base64url')})).toString('base64url');return `${raw}.${sign(raw)}`;
}
export function parseCookies(req:Request){return Object.fromEntries((req.headers.get('cookie')??'').split(';').map(part=>{const i=part.indexOf('=');return i<0?['','']:[part.slice(0,i).trim(),part.slice(i+1)];}));}
export function setCookie(name:string,value:string,maxAge:number){return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies()?'; Secure':''}`;}
export async function bodyText(req:Request,max=4096){
 if(Number(req.headers.get('content-length')??0)>max)throw new Error('Request is too large');
 const reader=req.body?.getReader();if(!reader)return '';const chunks:Uint8Array[]=[];let bytes=0;
 while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>max){await reader.cancel();throw new Error('Request is too large');}chunks.push(value);}
 return Buffer.concat(chunks).toString('utf8');
}
export function peer(req:Request){const value=(req.headers.get('x-forwarded-for')??'local').split(',').at(-1)?.trim()??'local';return /^[0-9a-fA-F:.]{1,64}$/.test(value)?value:'local';}
