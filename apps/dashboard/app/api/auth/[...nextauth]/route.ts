import { NextRequest } from 'next/server';
import { handlers } from '@/lib/auth';
import { bodyText,checkOrigin } from '@/lib/security';
export const runtime='nodejs';
export async function GET(req:NextRequest){try{return await handlers.GET(req);}catch{return Response.json({error:'Authentication is unavailable.'},{status:503});}}
export async function POST(req:NextRequest){
 try{checkOrigin(req.headers);const body=await bodyText(req);return await handlers.POST(new NextRequest(req.url,{method:'POST',headers:req.headers,body}));}
 catch{return Response.json({error:'Authentication request was not completed.'},{status:403});}
}
