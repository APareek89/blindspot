"use server";

// Selecting a discovered workflow is the user's explicit signal that Blindspot may optimize it.
// Discovery remains read-only; model experiments and recommendations will target selected flows.

import { revalidatePath } from "next/cache";
import { requireApi } from "@/lib/session";

export async function setWorkflowSelected(
  id: string,
  selected: boolean,
  _formData: FormData,
): Promise<void> {
  const client = await requireApi();
  await client.selectWorkflow(id, selected);
  revalidatePath("/workflows");
  revalidatePath("/routes");
}

export async function configureWorkflowReplay(id: string, formData: FormData): Promise<void> {
  const client = await requireApi();
  const secret = String(formData.get("secret") ?? "").trim();
  await client.configureWorkflowReplay(id, {
    url: String(formData.get("url") ?? "").trim(),
    ...(secret ? { secret } : {}),
    enabled: formData.get("enabled") === "on",
  });
  revalidatePath("/workflows");
  revalidatePath("/routes");
}
