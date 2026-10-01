/** BullMQ queue name for eval runs (worker consumes this). */
export const EVAL_QUEUE = "bs:evals";

/** Default judge model when JUDGE_MODEL is unset (configurable per PRD §11). */
export const DEFAULT_JUDGE_MODEL = "openai:gpt-4o-mini";

/** Default port the gateway listens on when PORT is unset. */
export const DEFAULT_GATEWAY_PORT = 8787;

// --- pagination (FMEA P2: list endpoints must be bounded) -----------------
/** Rows returned by a list endpoint when no `limit` is given. */
export const DEFAULT_PAGE_LIMIT = 50;
/** Hard ceiling on `limit` so one request can't scan an unbounded table. */
export const MAX_PAGE_LIMIT = 200;

export interface Pagination {
  limit: number;
  offset: number;
}

/** Raw pagination input as it arrives from query params (strings) or callers (numbers). */
export interface PageInput {
  limit?: string | number;
  offset?: string | number;
}

/**
 * Clamp raw `limit`/`offset` query values into a safe {limit, offset}.
 * Accepts strings (from query params) or numbers; ignores garbage. Never lets a
 * caller request more than {@link MAX_PAGE_LIMIT} rows or a negative offset.
 */
export function clampPagination(limit?: string | number, offset?: string | number): Pagination {
  const l = Math.floor(Number(limit));
  const o = Math.floor(Number(offset));
  return {
    limit: Number.isFinite(l) && l > 0 ? Math.min(l, MAX_PAGE_LIMIT) : DEFAULT_PAGE_LIMIT,
    offset: Number.isFinite(o) && o > 0 ? o : 0,
  };
}

// --- upload caps (FMEA P2: cap golden-set upload size) --------------------
/** Max raw bytes accepted for a golden-set upload payload (~1 MB). */
export const MAX_UPLOAD_BYTES = 1_000_000;
/** Max examples accepted from a single upload, so one file can't flood a route. */
export const MAX_UPLOAD_EXAMPLES = 500;
