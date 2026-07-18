"use server";

import { revalidatePath } from "next/cache";
import { requireApi } from "@/lib/session";
import type { EvalPlan } from "@/lib/types";

export type Result = { ok: true } | { ok: false; error: string };

function fail(e: unknown): Result {
  return { ok: false, error: e instanceof Error ? e.message : "action failed" };
}

function bust(route: string) {
  revalidatePath(`/routes/${route}`);
  revalidatePath("/routes");
  revalidatePath("/");
  revalidatePath("/approvals");
}

export async function savePolicy(
  route: string,
  patch: { minScore?: number; autoApprove?: boolean },
): Promise<Result> {
  const client = await requireApi();
  try {
    await client.patchRoute(route, patch);
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function addCandidateA(
  route: string,
  modelRef: string,
): Promise<Result> {
  const client = await requireApi();
  try {
    await client.addCandidate(route, { modelRef });
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function removeCandidateA(route: string, modelRef: string): Promise<Result> {
  const client = await requireApi();
  try {
    await client.removeCandidate(route, modelRef);
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function estimateEvalA(
  route: string,
  modelRefs: string[],
  budgetUsd: number,
): Promise<{ ok: true; plan: EvalPlan } | { ok: false; error: string }> {
  const client = await requireApi();
  try {
    const { plan } = await client.createEvalPlan(route, { modelRefs, budgetUsd });
    return { ok: true, plan };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "estimate failed" };
  }
}

export async function runEvalPlanA(route: string, planId: string): Promise<Result> {
  const client = await requireApi();
  try {
    await client.runEvalPlan(planId);
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function recommendA(route: string): Promise<Result> {
  const client = await requireApi();
  try {
    await client.recommend(route);
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}
