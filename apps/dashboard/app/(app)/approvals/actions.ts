"use server";
import { actionFailure } from "@/lib/action-error";

import { revalidatePath } from "next/cache";
import { requireApi } from "@/lib/session";

export type ActionResult = { ok: true } | { ok: false; code?: string; error: string };

function fail(e: unknown): ActionResult {
  return actionFailure(e);
}

/** Approve → the route's live model switches to the recommended model. */
export async function approveRec(id: string, expectedOwnerId: string): Promise<ActionResult> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.approve(id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/approvals");
  revalidatePath("/");
  revalidatePath("/routes");
  return { ok: true };
}

/** Reject → dismissed; the reason tunes future recommendations. */
export async function rejectRec(id: string, reason: string | undefined, expectedOwnerId: string): Promise<ActionResult> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.reject(id, reason?.trim() || undefined);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/approvals");
  revalidatePath("/");
  return { ok: true };
}
