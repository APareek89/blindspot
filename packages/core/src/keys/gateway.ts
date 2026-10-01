import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq,isNull } from "drizzle-orm";
import { apiKeys, getDb,getSql,fixtureMode,requireExecution } from "@blindspot/db";

/** Project-issued gateway keys look like `bs_live_<48 hex chars>`. */
export const GATEWAY_KEY_PREFIX = "bs_live_";

/**
 * The single source of truth for hashing a gateway key. Keys are stored ONLY as a
 * sha256 hash (+ a shown-once prefix) — never in plaintext. Auth (gateway) and
 * bootstrap both hash through this so the two can never drift apart.
 */
export function hashGatewayKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Generate shown-once key material without persisting the raw value. */
export function mintGatewayKeyMaterial() {
  const key = `${GATEWAY_KEY_PREFIX}${randomBytes(24).toString("hex")}`;
  return { key, prefix: key.slice(0, 12), keyHash: hashGatewayKey(key) };
}

/** Mint a new gateway key for a project. Returns the raw key ONCE (never stored/retrievable). */
export async function createGatewayKey(projectId: string) {
  if(!fixtureMode()){
    const actor=requireExecution();if(actor.projectId!==projectId||actor.authKind!=='session')throw new Error('Human sign-in is required');
    const count=(await getSql()`SELECT count(*)::int AS n FROM blindspot.api_keys WHERE project_id=${projectId} AND revoked_at IS NULL`)[0]!.n;
    if(Number(count)>=10)throw new Error('Revoke an old application key before creating another.');
  }
  const material = mintGatewayKeyMaterial();
  const row = (
    await getDb()
      .insert(apiKeys)
      .values({
        projectId,
        prefix: material.prefix,
        keyHash: material.keyHash,
      })
      .returning({ id: apiKeys.id, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt })
  )[0]!;
  return { id: row.id, prefix: row.prefix, createdAt: row.createdAt, key: material.key };
}

/** List a project's gateway keys — id, shown-once prefix, createdAt. Never the hash or value. */
export async function listGatewayKeys(projectId: string) {
  return getDb()
    .select({ id: apiKeys.id, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.projectId, projectId),isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
}

/**
 * Revoke one project-scoped gateway key. The final key is protected so a project cannot
 * accidentally lock itself out of the dashboard and key-management API.
 */
export async function deleteGatewayKey(projectId: string, keyId: string) {
  if(!fixtureMode()){
    const actor=requireExecution();if(actor.projectId!==projectId||actor.authKind!=='session')throw new Error('Human sign-in is required');
    const rows=await getSql()`UPDATE blindspot.api_keys SET revoked_at=now() WHERE id=${keyId} AND project_id=${projectId} AND revoked_at IS NULL RETURNING id`;
    return rows.length?'deleted' as const:'not_found' as const;
  }
  return getDb().transaction(async (tx) => {
    // Lock the project's key rows so two concurrent revocations cannot both observe two keys
    // and leave the project with none.
    const keys = await tx
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.projectId, projectId))
      .for("update");
    if (!keys.some((key) => key.id === keyId)) return "not_found" as const;
    if (keys.length === 1) return "last_key" as const;

    await tx
      .delete(apiKeys)
      .where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.id, keyId)));
    return "deleted" as const;
  });
}
