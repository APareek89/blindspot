"use server";

import { revalidatePath } from "next/cache";
import { requireApi } from "@/lib/session";

export type Result = { ok: true } | { ok: false; error: string };

function fail(e: unknown): Result {
  return { ok: false, error: e instanceof Error ? e.message : "action failed" };
}

function bust(route: string) {
  revalidatePath(`/golden-sets/${route}`);
  revalidatePath("/golden-sets");
  revalidatePath("/routes");
}

export async function seedUpload(
  route: string,
  format: "csv" | "json" | "jsonl",
  data: string,
): Promise<Result> {
  const client = await requireApi();
  try {
    await client.uploadGolden(route, { format, data });
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function seedGenerate(
  route: string,
  taskDescription: string,
  count: number,
  context: {
    productBrief?: string;
    systemPrompt?: string;
    architecture?: string;
    useLiveTraces?: boolean;
  } = {},
): Promise<Result> {
  const client = await requireApi();
  try {
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

export async function addEx(
  route: string,
  setId: string,
  body: { input: string; referenceOutput?: string; rubric?: string; label?: string },
): Promise<Result> {
  const client = await requireApi();
  try {
    await client.addExample(setId, body);
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function editEx(
  route: string,
  exId: string,
  patch: Partial<{ input: string; referenceOutput: string | null; rubric: string | null; label: string; active: boolean }>,
): Promise<Result> {
  const client = await requireApi();
  try {
    await client.updateExample(exId, patch);
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function delEx(route: string, exId: string): Promise<Result> {
  const client = await requireApi();
  try {
    await client.deleteExample(exId);
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}

export async function promote(route: string, setId: string, traceId: string): Promise<Result> {
  const client = await requireApi();
  try {
    await client.promoteTrace(setId, traceId);
  } catch (e) {
    return fail(e);
  }
  bust(route);
  return { ok: true };
}
