/**
 * Create one isolated invite-only beta project and a shown-once project key.
 *
 * pnpm --filter @blindspot/gateway invite -- --project "Acme Agent" --owner "owner@example.com"
 */
import { createInvitedProject } from "@blindspot/core";
import { loadRootEnv } from "@blindspot/shared";

loadRootEnv(import.meta.url);

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

async function main() {
  const name = option("--project");
  const owner = option("--owner");
  if (!name || !owner) {
    throw new Error('usage: invite -- --project "Project name" --owner "owner identity"');
  }

  const invited = await createInvitedProject({ name, owner });
  console.log("✓ project:", invited.project.name);
  console.log("✓ owner:", invited.project.userId);
  console.log("✓ dashboard: https://blindspot-dashboard.onrender.com/login");
  console.log("\n⚠ project key (share securely; shown once):\n  " + invited.key + "\n");
  console.log("The tester signs in, mints a separate application key, and starts metadata-only.");
}

main().catch((error) => {
  console.error("invite failed:", (error as Error).message);
  process.exit(1);
});
