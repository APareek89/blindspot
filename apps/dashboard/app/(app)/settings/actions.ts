"use server";
import { actionFailure } from "@/lib/action-error";

import { revalidatePath } from "next/cache";
import { requireApi } from "@/lib/session";

export type Result = { ok: true } | { ok: false; code?: string; error: string };

function fail(e: unknown): Result {
  return actionFailure(e);
}

export async function setProviderKeyA(provider: string, value: string, expectedOwnerId: string): Promise<Result> {
  if (!value.trim()) return { ok: false, error: "key value is empty" };
  try {
    const client = await requireApi(expectedOwnerId);
    await client.setProviderKey(provider, value.trim());
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteProviderKeyA(provider: string, expectedOwnerId: string): Promise<Result> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.deleteProviderKey(provider);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function syncModelRegistryA(provider: "anthropic" | "openai" | "hf" | "fireworks", expectedOwnerId: string
): Promise<Result> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.syncModelRegistry(provider);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings");
  revalidatePath("/routes");
  revalidatePath("/workflows");
  return { ok: true };
}

/** Mint a new gateway key. The raw key is returned ONCE — the caller must show + discard it. */
export async function mintKeyA(expectedOwnerId: string): Promise<{ ok: true; key: string } | { ok: false; code?: string; error: string }> {
  try {
    const client = await requireApi(expectedOwnerId);
    const { key } = await client.createGatewayKey();
    revalidatePath("/settings");
    return { ok: true, key: key.key };
  } catch (e) {
    return actionFailure(e);
  }
}

export async function revokeKeyA(id: string, expectedOwnerId: string): Promise<Result> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.deleteGatewayKey(id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings");
  return { ok: true };
}
