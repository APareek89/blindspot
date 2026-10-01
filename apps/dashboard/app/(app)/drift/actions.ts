"use server";
import { actionFailure } from "@/lib/action-error";

import { revalidatePath } from "next/cache";
import { requireApi } from "@/lib/session";

export type Result = { ok: true } | { ok: false; code?: string; error: string };

/** Simulate a provider version bump that drops the live model's score, to demo drift. */
export async function simulateDrift(route: string, newScore: number, expectedOwnerId: string): Promise<Result> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.driftCheck(route, { simulateNewScore: newScore });
  } catch (e) {
    return actionFailure(e);
  }
  revalidatePath("/drift");
  revalidatePath("/approvals");
  revalidatePath("/");
  return { ok: true };
}
