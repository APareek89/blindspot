import { parse } from "csv-parse/sync";
import {
  GoldenExampleInputSchema,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_EXAMPLES,
  type GoldenExampleInput,
} from "@blindspot/shared";

export type UploadFormat = "csv" | "json" | "jsonl";

/**
 * Parse + validate a golden-set upload (PRD §7 seed path).
 * CSV columns / JSONL keys: `input` (required), `reference_output`, `rubric`, `label`.
 * Throws a readable error on the first invalid row so the UI can show a preview.
 * FMEA P2: rejects payloads over {@link MAX_UPLOAD_BYTES} or {@link MAX_UPLOAD_EXAMPLES}
 * so one upload can't exhaust memory or flood a route.
 */
export function parseGoldenUpload(
  format: UploadFormat,
  data: string,
): GoldenExampleInput[] {
  const bytes = Buffer.byteLength(data, "utf8");
  if (bytes > MAX_UPLOAD_BYTES) {
    throw new Error(
      `upload is ${(bytes / 1e6).toFixed(2)} MB — max is ${(MAX_UPLOAD_BYTES / 1e6).toFixed(0)} MB`,
    );
  }

  let rows: unknown[];
  if (format === "csv") {
    rows = parse(data, { columns: true, skip_empty_lines: true, trim: true }) as unknown[];
  } else if (format === "json") {
    let decoded: unknown;
    try {
      decoded = JSON.parse(data);
    } catch {
      throw new Error("JSON upload must contain a valid array of examples");
    }
    const candidate =
      decoded && typeof decoded === "object" && !Array.isArray(decoded)
        ? (decoded as { examples?: unknown }).examples
        : decoded;
    if (!Array.isArray(candidate)) {
      throw new Error('JSON upload must be an array or an object with an "examples" array');
    }
    rows = candidate;
  } else {
    rows = data
          .split(/\r?\n/)
          .filter((line) => line.trim().length > 0)
          .map((line, i) => {
            try {
              return JSON.parse(line);
            } catch {
              throw new Error(`JSONL parse error on line ${i + 1}`);
            }
          });
  }

  if (rows.length > MAX_UPLOAD_EXAMPLES) {
    throw new Error(
      `upload has ${rows.length} rows — max is ${MAX_UPLOAD_EXAMPLES} per upload`,
    );
  }

  return rows.map((raw, i) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const parsed = GoldenExampleInputSchema.safeParse({
      input: row.input,
      referenceOutput: row.reference_output ?? row.referenceOutput ?? null,
      rubric: row.rubric ?? null,
      label: row.label ?? "unlabeled",
    });
    if (!parsed.success) {
      throw new Error(`row ${i + 1}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    }
    return parsed.data;
  });
}
