"use server";
import { actionFailure } from "@/lib/action-error";

import { revalidatePath } from "next/cache";
import { requireApi } from "@/lib/session";
import type { EvalExecutionMode, EvalPlan } from "@/lib/types";

export type Result = { ok: true } | { ok: false; code?: string; error: string };

function fail(e: unknown): Result {
  return actionFailure(e);
}

function bust(route: string) {
  revalidatePath(`/routes/${route}`);
  revalidatePath("/routes");
  revalidatePath("/");
  revalidatePath("/approvals");
}

export async function savePolicy(route: string, patch: { minScore?: number; autoApprove?: boolean }, expectedOwnerId: string
): Promise<Result> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.patchRoute(route, patch);
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function addCandidateA(route: string, modelRef: string, expectedOwnerId: string
): Promise<Result> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.addCandidate(route, { modelRef });
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function removeCandidateA(route: string, modelRef: string, expectedOwnerId: string): Promise<Result> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.removeCandidate(route, modelRef);
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function estimateEvalA(route: string, modelRefs: string[], budgetUsd: number, executionMode: EvalExecutionMode, expectedOwnerId: string
): Promise<{ ok: true; plan: EvalPlan } | { ok: false; code?: string; error: string }> {
  try {
    const client = await requireApi(expectedOwnerId);
    const { plan } = await client.createEvalPlan(route, { modelRefs, budgetUsd, executionMode });
    return { ok: true, plan };
  } catch (e) {
    return actionFailure(e);
  }
}

export async function runEvalPlanA(route: string, planId: string, expectedOwnerId: string): Promise<Result> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.runEvalPlan(planId);
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function recommendA(route: string, expectedOwnerId: string): Promise<Result> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.recommend(route);
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}
