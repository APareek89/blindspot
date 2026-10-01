"use server";
import { revalidatePath } from 'next/cache';
import { requireApi } from '@/lib/session';
import { actionFailure } from '@/lib/action-error';
export async function createExampleA(expectedOwnerId:string){
 try{const client=await requireApi(expectedOwnerId);const result=await client.createExample();revalidatePath('/');revalidatePath('/workflows');return {ok:true as const,...result};}
 catch(error){return actionFailure(error);}
}
