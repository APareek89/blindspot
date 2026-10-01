import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { api, type Client } from "./api";
import { requestActor } from "./auth";
import { AuthBoundaryError,checkOrigin,publicOrigin } from "./security";

/** The project key from the httpOnly cookie, or null. Server-only. */
export async function getKey(): Promise<null> { return null; }
async function currentActor(){return requestActor(new Request(publicOrigin()+'/api/session',{headers:new Headers(await headers())}));}
export async function requireUser(){const actor=await currentActor();if(!actor)redirect('/login');return {id:actor.id,email:actor.email};}

/** Get an API client for the signed-in project, or redirect to the sign-in screen. */
export async function requireApi(expectedOwnerId?:string): Promise<Client> {
  const actor=await currentActor();
  if(!actor){if(expectedOwnerId!==undefined)throw new AuthBoundaryError('AUTH_REQUIRED','Sign in to continue.');redirect('/login');}
  if(expectedOwnerId!==undefined){checkOrigin(new Headers(await headers()));if(actor.id!==expectedOwnerId)throw new AuthBoundaryError('SESSION_CHANGED','Your account changed. Refresh the page.');}
  return api(actor,expectedOwnerId!==undefined);
}
