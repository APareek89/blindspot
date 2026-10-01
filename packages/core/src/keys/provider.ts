import { and, desc, eq } from "drizzle-orm";
import { getDb, modelRegistry, providerKeys, fixtureMode,requireExecution } from "@blindspot/db";
import { PROVIDERS, decryptSecret, encryptSecret, type Provider } from "@blindspot/shared";

/** Fetch + decrypt a project's BYO key for a provider (in-memory only), or null. */
export async function getProviderKey(
  projectId: string,
  provider: Provider,
): Promise<string | null> {
  return (await providerCredential(projectId,provider))?.key??null;
}
export async function providerCredential(projectId:string,provider:Provider):Promise<{key:string;shared:boolean}|null>{
  if(!fixtureMode()&&requireExecution().projectId!==projectId)throw new Error('Project not found');
  const row = (
    await getDb()
      .select({ encryptedKey: providerKeys.encryptedKey })
      .from(providerKeys)
      .where(and(eq(providerKeys.projectId, projectId), eq(providerKeys.provider, provider)))
      .limit(1)
  )[0];
  if(row)return {key:decryptSecret(row.encryptedKey),shared:false};
  if(process.env.BLINDSPOT_MOCK_MODE==='1')return {key:'blindspot-internal-mock-credential',shared:true};
  // One configured server reference; never copied into a new user's encrypted BYOK rows.
  if(provider==='openai'&&process.env.OPENAI_API_KEY)return {key:process.env.OPENAI_API_KEY,shared:true};
  return null;
}

/** True if `p` is a provider we support (guards untrusted input from the API). */
export function isProvider(p: string): p is Provider {
  return (PROVIDERS as readonly string[]).includes(p);
}

/**
 * List which providers a project has a key for — provider + when it was saved.
 * NEVER returns the encrypted blob or the plaintext value (PRD §5, §10 Settings).
 */
export async function listProviderKeys(projectId: string) {
  return getDb()
    .select({ provider: providerKeys.provider, createdAt: providerKeys.createdAt })
    .from(providerKeys)
    .where(eq(providerKeys.projectId, projectId))
    .orderBy(desc(providerKeys.createdAt));
}

/** Store (or replace) a project's BYO key for a provider, encrypted at rest (AES-256-GCM). */
export async function setProviderKey(projectId: string, provider: Provider, rawValue: string) {
  const encryptedKey = encryptSecret(rawValue);
  const row = await getDb().transaction(async (tx) => {
    const saved = (
      await tx
        .insert(providerKeys)
        .values({ projectId, provider, encryptedKey })
        .onConflictDoUpdate({
          target: [providerKeys.projectId, providerKeys.provider],
          set: { encryptedKey },
        })
        .returning({ provider: providerKeys.provider, createdAt: providerKeys.createdAt })
    )[0]!;
    // A replacement key can belong to a different provider account. Preserve the cached catalog
    // for display, but require a fresh account-access sync before it can pass compatibility.
    await tx
      .update(modelRegistry)
      .set({ probeStatus: "unverified", lastProbedAt: null })
      .where(and(eq(modelRegistry.projectId, projectId), eq(modelRegistry.provider, provider)));
    return saved;
  });
  return row; // { provider, createdAt } — never the value
}

/** Remove a project's key for a provider. Returns true if a row was deleted. */
export async function deleteProviderKey(projectId: string, provider: Provider): Promise<boolean> {
  const deleted = await getDb().transaction(async (tx) => {
    const removed = await tx
      .delete(providerKeys)
      .where(and(eq(providerKeys.projectId, projectId), eq(providerKeys.provider, provider)))
      .returning({ id: providerKeys.id });
    if (removed.length > 0) {
      await tx
        .update(modelRegistry)
        .set({ probeStatus: "unverified", lastProbedAt: null })
        .where(and(eq(modelRegistry.projectId, projectId), eq(modelRegistry.provider, provider)));
    }
    return removed;
  });
  return deleted.length > 0;
}
