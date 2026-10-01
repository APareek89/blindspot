import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | null = null;
export function getSql() {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const parsed = new URL(url);
  for (const key of [...parsed.searchParams.keys()]) if (key.toLowerCase().startsWith("ssl")) parsed.searchParams.delete(key);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  const fixture = process.env.BLINDSPOT_AUTH_ENABLED === "0" && process.env.NODE_ENV !== "production";
  const preview = process.env.BLINDSPOT_LOCAL_PREVIEW === "1" && local && process.env.BLINDSPOT_MOCK_MODE === "1";
  if (process.env.BLINDSPOT_AUTH_ENABLED === "0" && process.env.NODE_ENV === "production") throw new Error("Authentication is required");
  const disable = process.env.DATABASE_SSL === "disable" || fixture;
  if (disable && (!local || (process.env.NODE_ENV === "production" && !preview))) throw new Error("TLS is required");
  const ca = process.env.DATABASE_SSL_CA_FILE;
  if (!disable && !ca) throw new Error("Database CA is required");
  client = postgres(parsed.toString(), { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10,
    connection: { statement_timeout: 15000, lock_timeout: 5000 },
    ssl: disable ? false : { rejectUnauthorized: true, ca: readFileSync(ca!, "utf8") },
    onnotice: () => {},
  });
  return client;
}
function createDb() {
  return drizzle(getSql(), { schema });
}

let cached: ReturnType<typeof createDb> | null = null;

/**
 * Lazily create the Drizzle client. Not called at import time so the repo runs
 * with a blank `.env` (Phase 0). Throws only when actually used without a URL.
 */
export function getDb() {
  return (cached ??= createDb());
}
