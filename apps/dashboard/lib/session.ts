import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, type Client } from "./api";
import { KEY_COOKIE } from "./auth-cookie";

/** The project key from the httpOnly cookie, or null. Server-only. */
export async function getKey(): Promise<string | null> {
  const store = await cookies();
  return store.get(KEY_COOKIE)?.value ?? null;
}

/** Get an API client for the signed-in project, or redirect to the sign-in screen. */
export async function requireApi(): Promise<Client> {
  const key = await getKey();
  if (!key) redirect("/login");
  return api(key);
}
