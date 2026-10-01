import { createHash,createHmac,randomUUID,timingSafeEqual } from "node:crypto";
import { activeSession,type SessionActor } from "./identity";
import { getSql } from "./client";
function secret(){const value=process.env.BLINDSPOT_BRIDGE_SECRET;if(!value||value.length<32)throw new Error("Private gateway bridge is unavailable");return value;}
function signature(value:string){return createHmac("sha256",secret()).update(value).digest("base64url");}
function hash(body:string){return createHash("sha256").update(body).digest("hex");}
export function signActor(actor:SessionActor,method:string,path:string,body:string){
 const raw=Buffer.from(JSON.stringify({v:1,owner:actor.id,sid:actor.sid,project:actor.projectId,method,path,body:hash(body),exp:Date.now()+60000,nonce:randomUUID()})).toString("base64url");
 return `${raw}.${signature(raw)}`;
}
export async function verifyActor(token:string,method:string,path:string,body:string):Promise<SessionActor|null>{
 if(token.length>2048)return null;const [raw,sig,extra]=token.split('.');if(!raw||!sig||extra||!/^[A-Za-z0-9_-]+$/.test(raw)||!/^[A-Za-z0-9_-]{43}$/.test(sig))return null;
 const expected=signature(raw);if(!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
 let value;try{value=JSON.parse(Buffer.from(raw,'base64url').toString('utf8'));}catch{return null;}
 if(value.v!==1||value.method!==method||value.path!==path||value.body!==hash(body)||!Number.isSafeInteger(value.exp)||value.exp<=Date.now()||value.exp>Date.now()+65000||typeof value.nonce!=='string')return null;
 const actor=await activeSession(value.owner,value.sid);if(!actor||actor.projectId!==value.project)return null;
 const accepted=await getSql().begin(async sql=>{
  await sql`DELETE FROM blindspot.bridge_nonces WHERE expires_at<now()`;
  const rows=await sql`INSERT INTO blindspot.bridge_nonces(nonce,expires_at) VALUES(${value.nonce},${new Date(value.exp).toISOString()}) ON CONFLICT DO NOTHING RETURNING nonce`;
  return rows.length===1;
 });
 return accepted?actor:null;
}
