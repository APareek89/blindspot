"use server";

import { revalidatePath } from "next/cache";
import { requireApi } from "@/lib/session";

export type Result = { ok: true } | { ok: false; error: string };

function fail(e: unknown): Result {
  return { ok: false, error: e instanceof Error ? e.message : "action failed" };
}

export async function setProviderKeyA(provider: string, value: string): Promise<Result> {
  if (!value.trim()) return { ok: false, error: "key value is empty" };
  const client = await requireApi();
  try {
    await client.setProviderKey(provider, value.trim());
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteProviderKeyA(provider: string): Promise<Result> {
  const client = await requireApi();
  try {
    await client.deleteProviderKey(provider);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function syncModelRegistryA(
  provider: "anthropic" | "hf" | "fireworks",
): Promise<Result> {
  const client = await requireApi();
  try {
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
export async function mintKeyA(): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const client = await requireApi();
  try {
    const { key } = await client.createGatewayKey();
    revalidatePath("/settings");
    return { ok: true, key: key.key };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "mint failed" };
  }
}

export async function revokeKeyA(id: string): Promise<Result> {
  const client = await requireApi();
  try {
    await client.deleteGatewayKey(id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/settings");
  return { ok: true };
}
