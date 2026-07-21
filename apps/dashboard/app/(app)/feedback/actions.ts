"use server";

import { revalidatePath } from "next/cache";
import { requireApi } from "@/lib/session";
import type { BetaFeedbackImpact, BetaFeedbackStage, CaptureMode } from "@/lib/types";

export type FeedbackState = { ok: boolean; error?: string };

export async function submitFeedback(
  _previous: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  if (formData.get("confirmSafe") !== "yes") {
    return { ok: false, error: "Confirm that you removed secrets and customer data." };
  }
  const client = await requireApi();
  try {
    await client.submitBetaFeedback({
      stage: String(formData.get("stage")) as BetaFeedbackStage,
      attempted: String(formData.get("attempted") ?? ""),
      expected: String(formData.get("expected") ?? ""),
      actual: String(formData.get("actual") ?? ""),
      impact: String(formData.get("impact")) as BetaFeedbackImpact,
      framework: String(formData.get("framework") ?? "") || undefined,
      captureMode:
        (String(formData.get("captureMode") ?? "") as CaptureMode | "not_sure") || undefined,
      confirmSafe: true,
    });
    revalidatePath("/feedback");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "feedback could not be saved" };
  }
}
