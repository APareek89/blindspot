import { desc, eq } from "drizzle-orm";
import {
  getDb,
  goldenExamples,
  goldenSets,
  routes,
  traces,
} from "@blindspot/db";
import type { GoldenExampleInput } from "@blindspot/shared";

// --- tenant ownership resolvers (guard against cross-project IDOR) ---------
/** Project that owns a golden set (via its route), or null if unknown. */
export async function goldenSetProjectId(goldenSetId: string): Promise<string | null> {
  const rows = await getDb()
    .select({ pid: routes.projectId })
    .from(goldenSets)
    .innerJoin(routes, eq(goldenSets.routeId, routes.id))
    .where(eq(goldenSets.id, goldenSetId))
    .limit(1);
  return rows[0]?.pid ?? null;
}

/** Project that owns a golden example (via golden set → route), or null. */
export async function goldenExampleProjectId(exampleId: string): Promise<string | null> {
  const rows = await getDb()
    .select({ pid: routes.projectId })
    .from(goldenExamples)
    .innerJoin(goldenSets, eq(goldenExamples.goldenSetId, goldenSets.id))
    .innerJoin(routes, eq(goldenSets.routeId, routes.id))
    .where(eq(goldenExamples.id, exampleId))
    .limit(1);
  return rows[0]?.pid ?? null;
}

/** Project that owns a trace (via its route), or null. */
export async function traceProjectId(traceId: string): Promise<string | null> {
  const rows = await getDb()
    .select({ pid: traces.projectId })
    .from(traces)
    .where(eq(traces.id, traceId))
    .limit(1);
  return rows[0]?.pid ?? null;
}

type GoldenLabel = "pass" | "fail" | "unlabeled";

/** Create a new golden set version and insert its examples. */
export async function createGoldenSet(opts: {
  routeId: string;
  origin: "upload" | "agent" | "grown";
  examples: GoldenExampleInput[];
}) {
  const db = getDb();
  // FMEA P2: the set row and its examples must land atomically — a failed examples
  // insert must not leave an empty golden-set version behind. Locking the parent route
  // also serializes version allocation, so concurrent upload/agent calls cannot collide.
  return db.transaction(async (tx) => {
    const owner = (
      await tx
        .select({ id: routes.id })
        .from(routes)
        .where(eq(routes.id, opts.routeId))
        .limit(1)
        .for("update")
    )[0];
    if (!owner) throw new Error("route not found");
    const latest = (
      await tx
        .select({ version: goldenSets.version })
        .from(goldenSets)
        .where(eq(goldenSets.routeId, opts.routeId))
        .orderBy(desc(goldenSets.version))
        .limit(1)
    )[0];
    const version = (latest?.version ?? 0) + 1;
    const gs = (
      await tx
        .insert(goldenSets)
        .values({ routeId: opts.routeId, version, origin: opts.origin })
        .returning()
    )[0]!;

    if (opts.examples.length > 0) {
      await tx.insert(goldenExamples).values(
        opts.examples.map((e) => ({
          goldenSetId: gs.id,
          input: e.input,
          referenceOutput: e.referenceOutput ?? null,
          rubric: e.rubric ?? null,
          label: e.label,
        })),
      );
    }
    return gs;
  });
}

export async function listGoldenSets(routeId: string) {
  return getDb()
    .select()
    .from(goldenSets)
    .where(eq(goldenSets.routeId, routeId))
    .orderBy(desc(goldenSets.version));
}

export async function listExamples(goldenSetId: string) {
  return getDb()
    .select()
    .from(goldenExamples)
    .where(eq(goldenExamples.goldenSetId, goldenSetId));
}

export async function addExample(goldenSetId: string, e: GoldenExampleInput) {
  return (
    await getDb()
      .insert(goldenExamples)
      .values({
        goldenSetId,
        input: e.input,
        referenceOutput: e.referenceOutput ?? null,
        rubric: e.rubric ?? null,
        label: e.label,
      })
      .returning()
  )[0]!;
}

/** Curate: edit / label / activate a single example (PRD §7 full control). */
export async function updateExample(
  id: string,
  patch: Partial<{
    input: string;
    referenceOutput: string | null;
    rubric: string | null;
    label: GoldenLabel;
    active: boolean;
  }>,
) {
  const rows = await getDb()
    .update(goldenExamples)
    .set(patch)
    .where(eq(goldenExamples.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteExample(id: string): Promise<void> {
  await getDb().delete(goldenExamples).where(eq(goldenExamples.id, id));
}

/** Promote a production trace into a golden set in one call (PRD §7). */
export async function promoteTrace(opts: {
  goldenSetId: string;
  traceId: string;
}) {
  const [trace, goldenSet] = await Promise.all([
    getDb().select().from(traces).where(eq(traces.id, opts.traceId)).limit(1).then((rows) => rows[0]),
    getDb()
      .select({ routeId: goldenSets.routeId })
      .from(goldenSets)
      .where(eq(goldenSets.id, opts.goldenSetId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (!trace) throw new Error("trace not found");
  if (!goldenSet) throw new Error("golden set not found");
  if (!trace.routeId || trace.routeId !== goldenSet.routeId) {
    throw new Error("only a trace from this route can be promoted into its golden set");
  }

  return addExample(opts.goldenSetId, {
    input: extractInput(trace.input),
    referenceOutput: trace.output ?? null,
    rubric: null,
    label: "unlabeled",
  });
}

/** Pull a plain-text input from a trace's stored messages (jsonb). */
function extractInput(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    const msgs = raw as Array<{ role?: string; content?: unknown }>;
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    const chosen = lastUser ?? msgs[msgs.length - 1];
    if (chosen && typeof chosen.content === "string") return chosen.content;
  }
  return JSON.stringify(raw);
}
