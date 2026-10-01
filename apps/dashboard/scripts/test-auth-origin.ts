import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import * as login from '../app/login/session/route';
import * as logout from '../app/logout/route';
import * as preview from '../app/signup/preview/route';
import * as signup from '../app/signup/session/route';

// Project keys/invites are no longer alternate human authentication paths. Actual
// Credentials callback, strict Origin and cookie revocation are covered by the
// compiled HTTP + real PostgreSQL suite (scripts/test-portfolio-http.mts).
async function main(){
 const prior=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Retired routes must not contact the gateway');};let checks=0;
 try{
  for(const [path,handlers] of [['/login/session',login],['/logout',logout],['/signup/preview',preview],['/signup/session',signup]] as const){
   for(const origin of ['https://blindspot.example','https://foreign.example','null',undefined]){
    const request=new NextRequest('https://blindspot.example'+path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...(origin?{origin}:{})},body:'key=synthetic-retired-key&next=%2Fconnect'});
    const response=await handlers.POST(request);assert.equal(response.status,410);assert(!response.headers.has('set-cookie'));assert(!response.headers.has('location'));checks++;
   }
   const response=await handlers.GET(new NextRequest('https://blindspot.example'+path));assert.equal(response.status,410);assert(!response.headers.has('set-cookie'));checks++;
  }
 }finally{globalThis.fetch=prior;}
 console.log(JSON.stringify({status:'passed',checks,retiredHumanPaths:4,providerCalls:0}));
}
void main().catch(()=>{console.error('retired authentication route regression failed');process.exitCode=1;});
