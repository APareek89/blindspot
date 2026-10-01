import { and, eq } from "drizzle-orm";
import { executionFeedback, getDb, workflows } from "@blindspot/db";
import { ExecutionFeedbackInputSchema, type ExecutionFeedbackInput } from "@blindspot/shared";

/**
 * Store one end-user feedback event. App-supplied and best-effort: it links to a workflow
 * when that workflow already exists (spans arrive first), otherwise it is retained unlinked.
 */
export async function recordExecutionFeedback(
  projectId: string,
  rawInput: ExecutionFeedbackInput,
): Promise<{ id: string }> {
  const input = ExecutionFeedbackInputSchema.parse(rawInput);
  const db = getDb();
  const workflow = (
    await db
      .select({ id: workflows.id, exampleKind: workflows.exampleKind })
      .from(workflows)
      .where(
        and(
          eq(workflows.projectId, projectId),
          eq(workflows.name, input.workflow.name),
          eq(workflows.environment, input.workflow.environment),
        ),
      )
      .limit(1)
  )[0];
  if(workflow?.exampleKind==='prepared')throw Object.assign(new Error('Prepared examples do not accept feedback edits.'),{code:'PREPARED_READ_ONLY'});
  const row = (
    await db
      .insert(executionFeedback)
      .values({
        projectId,
        workflowId: workflow?.id ?? null,
        executionExternalId: input.executionId,
        nodeName: input.nodeName ?? null,
        kind: input.kind,
        value: input.kind === "score" ? (input.value ?? null) : null,
        comment: input.comment ?? null,
      })
      .returning({ id: executionFeedback.id })
  )[0]!;
  return { id: row.id };
}
