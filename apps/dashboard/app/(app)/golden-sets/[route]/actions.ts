"use server";
import { actionFailure } from "@/lib/action-error";

import { revalidatePath } from "next/cache";
import { requireApi } from "@/lib/session";

export type Result = { ok: true } | { ok: false; code?: string; error: string };

function fail(e: unknown): Result {
  return actionFailure(e);
}

function bust(route: string) {
  revalidatePath(`/golden-sets/${route}`);
  revalidatePath("/golden-sets");
  revalidatePath("/routes");
}

export async function seedUpload(route: string, format: "csv" | "json" | "jsonl", data: string, expectedOwnerId: string
): Promise<Result> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.uploadGolden(route, { format, data });
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function seedGenerate(route: string, taskDescription: string, count: number, context: {
    productBrief?: string;
    systemPrompt?: string;
    architecture?: string;
    useLiveTraces?: boolean;
  } = {}, expectedOwnerId: string
): Promise<Result> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.generateGolden(route, {
      taskDescription: taskDescription.trim() || undefined,
      count,
      productBrief: context.productBrief?.trim() || undefined,
      systemPrompt: context.systemPrompt?.trim() || undefined,
      architecture: context.architecture?.trim() || undefined,
      useLiveTraces: context.useLiveTraces,
    });
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function addEx(route: string, setId: string, body: { input: string; referenceOutput?: string; rubric?: string; label?: string }, expectedOwnerId: string
): Promise<Result> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.addExample(setId, body);
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function editEx(route: string, exId: string, patch: Partial<{ input: string; referenceOutput: string | null; rubric: string | null; label: string; active: boolean }>, expectedOwnerId: string
): Promise<Result> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.updateExample(exId, patch);
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function delEx(route: string, exId: string, expectedOwnerId: string): Promise<Result> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.deleteExample(exId);
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function promote(route: string, setId: string, traceId: string, expectedOwnerId: string): Promise<Result> {
  try {
    const client = await requireApi(expectedOwnerId);
    await client.promoteTrace(setId, traceId);
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}
