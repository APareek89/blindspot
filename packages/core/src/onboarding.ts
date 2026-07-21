import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiKeys, getDb, projects } from "@blindspot/db";
import { mintGatewayKeyMaterial } from "./keys/gateway";

export const InvitedProjectInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  owner: z.string().trim().min(3).max(254),
});

/**
 * Operator-assisted beta onboarding. Project and first shown-once key are one transaction,
 * so a failed key write cannot leave an unusable project behind.
 */
export async function createInvitedProject(input: z.infer<typeof InvitedProjectInputSchema>) {
  const parsed = InvitedProjectInputSchema.parse(input);
  const material = mintGatewayKeyMaterial();
  return getDb().transaction(async (tx) => {
    const existing = (
      await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.userId, parsed.owner), eq(projects.name, parsed.name)))
        .limit(1)
    )[0];
    if (existing) {
      throw new Error("a project with this owner and name already exists");
    }

    const project = (
      await tx
        .insert(projects)
        .values({ userId: parsed.owner, name: parsed.name, captureMode: "metadata" })
        .returning({ id: projects.id, name: projects.name, userId: projects.userId })
    )[0]!;
    await tx.insert(apiKeys).values({
      projectId: project.id,
      prefix: material.prefix,
      keyHash: material.keyHash,
    });
    return { project, key: material.key, prefix: material.prefix };
  });
}
