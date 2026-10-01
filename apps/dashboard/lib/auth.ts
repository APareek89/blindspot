import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { getToken } from 'next-auth/jwt';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { activeSession,authSecret,createSession,getSql,rateLimit,revokeSession } from '@blindspot/db';
import { publicOrigin,secureCookies,peer } from './security';
const dummy=bcrypt.hashSync(randomBytes(32).toString('hex'),12);
export function sessionCookie(){return secureCookies()?'__Secure-blindspot-session':'blindspot-session';}
export function credentials(value:unknown){
 const v=value as Record<string,unknown>|null;const email=typeof v?.email==='string'?v.email.trim().toLowerCase():'';const password=typeof v?.password==='string'?v.password:'';
 if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||password.length<12||Buffer.byteLength(password)>72)throw new Error('Use a valid email and a password of 12 characters, up to 72 UTF-8 bytes.');
 return {email,password};
}
export const {handlers,auth}=NextAuth(()=>({
 secret:authSecret(),trustHost:true,useSecureCookies:secureCookies(),session:{strategy:'jwt',maxAge:7*86400},
 cookies:{sessionToken:{name:sessionCookie(),options:{httpOnly:true,sameSite:'lax',path:'/',secure:secureCookies()}}},
 providers:[Credentials({credentials:{email:{type:'email'},password:{type:'password'}},async authorize(value,request){
  await rateLimit(`login-ip:${peer(request)}`,30,900);let input;try{input=credentials(value);}catch{return null;}
  await rateLimit(`login-email:${input.email}`,15,900);
  const user=(await getSql()`SELECT id,email,password_hash,disabled FROM blindspot.users WHERE email=${input.email}`)[0];
  const valid=await bcrypt.compare(input.password,user?.password_hash??dummy);if(!user||!valid||user.disabled)return null;
  const sid=await createSession(user.id);return {id:user.id,email:user.email,sid};
 }})],
 callbacks:{
  async jwt({token,user}){if(user){token.ownerId=user.id;token.sid=(user as typeof user&{sid:string}).sid;}return token;},
  async session({session,token}){const actor=await activeSession(token.ownerId,token.sid);return {...session,user:actor?{id:actor.id,email:actor.email}:undefined};},
  async redirect({url}){const base=publicOrigin();try{const target=new URL(url,base);return target.origin===base?target.href:base;}catch{return base;}},
 },
 events:{async signOut(message){if('token' in message && message.token?.ownerId && message.token.sid)await revokeSession(String(message.token.ownerId),String(message.token.sid));}},
 logger:{error(){},warn(){},debug(){}},
}));
export async function requestActor(req:Request){
 const token=await getToken({req,secret:authSecret(),cookieName:sessionCookie(),salt:sessionCookie(),secureCookie:secureCookies()});
 return token?activeSession(token.ownerId,token.sid):null;
}
