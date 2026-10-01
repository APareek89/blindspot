"use server";
import { actionFailure } from "@/lib/action-error";

import { revalidatePath } from "next/cache";
import { requireApi } from "@/lib/session";
import type { CaptureMode } from "@/lib/types";

export async function setCaptureMode(mode: CaptureMode, _formData: FormData, expectedOwnerId: string): Promise<{ok:true}|ReturnType<typeof actionFailure>> {
  try {
  const client = await requireApi(expectedOwnerId);
  await client.setDataControls(mode);
  revalidatePath("/connect");
  return {ok:true};
  } catch(error){return actionFailure(error);}
}
