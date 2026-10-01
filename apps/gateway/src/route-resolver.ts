import { and, eq } from "drizzle-orm";
import { candidates, getDb, routes } from "@blindspot/db";
import { DEFAULT_POLICY } from "@blindspot/shared";

/** Look up a route by project + name, or null. */
export async function getRouteByName(projectId: string, name: string) {
  const rows = await getDb()
    .select()
    .from(routes)
    .where(and(eq(routes.projectId, projectId), eq(routes.name, name)))
    .limit(1);
  return rows[0] ?? null;
}

export interface ResolvedRoute {
  id: string;
  /** The model that traffic should actually hit right now. */
  modelRef: string;
  created: boolean;
}

/**
 * Resolve `route:<name>` for a project. If the route doesn't exist yet, create it
 * from traffic (PRD §12 Phase 1) seeded with `defaultModel` as its live model +
 * first candidate. Never switches an existing route's live model here — that only
 * happens through an approved Recommendation (PRD §3).
 */
export async function resolveOrCreateRoute(
  projectId: string,
  routeName: string,
  defaultModel: string,
): Promise<ResolvedRoute> {
  const db = getDb();
  const existing = await db
    .select()
    .from(routes)
    .where(and(eq(routes.projectId, projectId), eq(routes.name, routeName)))
    .limit(1);

  const found = existing[0];
  if (found) {
    if(found.exampleKind==='prepared')throw new Error('Prepared routes cannot dispatch models');
    return { id: found.id, modelRef: found.liveModel ?? defaultModel, created: false };
  }

  const inserted = await db
    .insert(routes)
    .values({
      projectId,
      name: routeName,
      liveModel: defaultModel,
      policyJson: DEFAULT_POLICY,
    })
    .onConflictDoNothing()
    .returning();

  const route = inserted[0];
  if (!route) {
    // Lost the create race to a concurrent first-hit — fetch the winner instead of 500ing.
    const winner = await db
      .select()
      .from(routes)
      .where(and(eq(routes.projectId, projectId), eq(routes.name, routeName)))
      .limit(1);
    const existingRoute = winner[0];
    if (!existingRoute) throw new Error("route creation raced and vanished");
    return {
      id: existingRoute.id,
      modelRef: existingRoute.liveModel ?? defaultModel,
      created: false,
    };
  }

  await db
    .insert(candidates)
    .values({ routeId: route.id, modelRef: defaultModel, source: "api", enabled: true })
    .onConflictDoNothing();

  return { id: route.id, modelRef: defaultModel, created: true };
}
