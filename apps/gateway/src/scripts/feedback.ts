/** Operator-only review of project-scoped private-beta feedback. No HTTP route exposes this view. */
import { desc, eq } from "drizzle-orm";
import { betaFeedback, getDb, projects } from "@blindspot/db";
import { loadRootEnv } from "@blindspot/shared";

loadRootEnv(import.meta.url);

function requestedLimit() {
  const index = process.argv.indexOf("--limit");
  const parsed = Number(index >= 0 ? process.argv[index + 1] : 25);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 100) : 25;
}

async function main() {
  const rows = await getDb()
    .select({
      id: betaFeedback.id,
      project: projects.name,
      owner: projects.userId,
      stage: betaFeedback.stage,
      impact: betaFeedback.impact,
      attempted: betaFeedback.attempted,
      expected: betaFeedback.expected,
      actual: betaFeedback.actual,
      framework: betaFeedback.framework,
      captureMode: betaFeedback.captureMode,
      createdAt: betaFeedback.createdAt,
    })
    .from(betaFeedback)
    .innerJoin(projects, eq(betaFeedback.projectId, projects.id))
    .orderBy(desc(betaFeedback.createdAt))
    .limit(requestedLimit());
  console.log(JSON.stringify({ feedback: rows }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("feedback review failed:", (error as Error).message);
    process.exit(1);
  });
