import { desc, eq } from "drizzle-orm";
import { betaFeedback, getDb } from "@blindspot/db";
import { BetaFeedbackInputSchema, type BetaFeedbackInput } from "@blindspot/shared";

/** Persist only feedback the signed-in project owner explicitly submits. */
export async function submitBetaFeedback(projectId: string, input: BetaFeedbackInput) {
  const parsed = BetaFeedbackInputSchema.parse(input);
  const row = (
    await getDb()
      .insert(betaFeedback)
      .values({
        projectId,
        stage: parsed.stage,
        attempted: parsed.attempted,
        expected: parsed.expected,
        actual: parsed.actual,
        impact: parsed.impact,
        framework: parsed.framework || null,
        captureMode: parsed.captureMode || null,
      })
      .returning()
  )[0];
  if (!row) throw new Error("feedback could not be saved");
  return row;
}

export async function listBetaFeedback(projectId: string, limit = 10) {
  return getDb()
    .select()
    .from(betaFeedback)
    .where(eq(betaFeedback.projectId, projectId))
    .orderBy(desc(betaFeedback.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
}
