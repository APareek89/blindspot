/** Create a recipient/project-bound beta signup link. The link is a shown-once credential. */
import { createSignupInvite } from "@blindspot/core";
import { loadRootEnv } from "@blindspot/shared";

loadRootEnv(import.meta.url);

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function main() {
  const owner = option("--owner");
  const project = option("--project");
  const days = Number(option("--days") ?? "7");
  if (!owner || !project || !Number.isInteger(days) || days < 1 || days > 30) {
    throw new Error(
      'usage: signup-link -- --owner "owner@example.com" --project "Acme Agent" [--days 7]',
    );
  }
  const dashboard = (process.env.BLINDSPOT_DASHBOARD_URL ?? "https://blindspot-dashboard.onrender.com")
    .replace(/\/$/, "");
  const { token, claims } = createSignupInvite({
    owner,
    project,
    expiresInSeconds: days * 24 * 60 * 60,
  });
  const link = `${dashboard}/signup#invite=${encodeURIComponent(token)}`;

  console.log("✓ recipient:", claims.owner);
  console.log("✓ project:", claims.project);
  console.log("✓ expires:", new Date(claims.expiresAt * 1000).toISOString());
  console.log("\n⚠ signup link (share securely; do not paste into tickets or logs):\n" + link + "\n");
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("signup-link failed:", (error as Error).message);
  process.exit(1);
}
