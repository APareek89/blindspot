import { AsyncLocalStorage } from "node:async_hooks";
import { getSql } from "./client";

export type Execution = Readonly<{ ownerId: string; projectId: string; authKind: "session" | "sdk";
  authId: string; mode: "live" | "prepared"; exampleId?: string }>;
const context = new AsyncLocalStorage<Execution>();
export function fixtureMode() { return process.env.BLINDSPOT_AUTH_ENABLED === "0" && process.env.NODE_ENV !== "production"; }
export function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new Error("Invalid identity");
  return value;
}
export function withExecution<T>(actor: Execution, fn: () => T): T {
  uuid(actor.ownerId); uuid(actor.projectId); uuid(actor.authId);
  return context.run(Object.freeze({ ...actor }), fn);
}
export function requireExecution(): Execution {
  const actor = context.getStore();
  if (!actor) throw new Error("Verified execution identity is required");
  return actor;
}
export async function assertExecutionActive(actor = requireExecution()) {
  const sql = getSql();
  const rows = actor.authKind === "session"
    ? await sql`SELECT p.id FROM blindspot.projects p JOIN blindspot.users u ON u.id=p.user_id
        JOIN blindspot.sessions s ON s.owner_id=u.id WHERE p.id=${actor.projectId} AND u.id=${actor.ownerId}
        AND s.id=${actor.authId} AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT u.disabled`
    : await sql`SELECT p.id FROM blindspot.projects p JOIN blindspot.users u ON u.id=p.user_id
        JOIN blindspot.api_keys k ON k.project_id=p.id WHERE p.id=${actor.projectId} AND u.id=${actor.ownerId}
        AND k.id=${actor.authId} AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at>now()) AND NOT u.disabled`;
  if (!rows.length) throw new Error("Execution authorization expired");
  return actor;
}
