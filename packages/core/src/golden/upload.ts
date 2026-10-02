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
 * CSV columns / JSONL keys: `input` (required), `reference_output` (`referenceOutput` / `expected` aliases), `rubric`, `label`.
 * Throws a readable error on the first invalid row so the UI can show a preview.
 * FMEA P2: rejects payloads over {@link MAX_UPLOAD_BYTES} or {@link MAX_UPLOAD_EXAMPLES}
 * so one upload can't exhaust memory or flood a route.
 */
export function parseGoldenUpload(
  format: UploadFormat,
  data: string,
): GoldenExampleInput[] {
  if (typeof data !== "string") throw new Error("Dataset content must be text");
  if (!["csv", "json", "jsonl"].includes(format)) throw new Error("Choose CSV, JSON or JSONL");
  const bytes = Buffer.byteLength(data, "utf8");
  if (bytes > MAX_UPLOAD_BYTES) {
    throw new Error(
      `upload is ${(bytes / 1e6).toFixed(2)} MB — max is ${(MAX_UPLOAD_BYTES / 1e6).toFixed(0)} MB`,
    );
  }
  data = data.replace(/^\uFEFF/, "");

  let rows: unknown[];
  if (format === "csv") {
    rows = parse(data, { columns: (headers: string[]) => {
      if (new Set(headers).size !== headers.length) throw new Error("CSV column names must be unique");
      return headers;
    }, bom: true, skip_empty_lines: true, trim: true }) as unknown[];
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
    rows = data.replace(/^\uFEFF/, "")
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

  if (rows.length === 0) throw new Error("Dataset must contain at least one example");
  if (rows.length > MAX_UPLOAD_EXAMPLES) {
    throw new Error(
      `upload has ${rows.length} rows — max is ${MAX_UPLOAD_EXAMPLES} per upload`,
    );
  }

  return rows.map((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`row ${i + 1}: each example must be an object with input and optional reference_output, rubric, label`);
    }
    const row = raw as Record<string, unknown>;
    const allowed = new Set(["input", "reference_output", "referenceOutput", "expected", "rubric", "label"]);
    if (Object.keys(row).some(key => !allowed.has(key))) {
      throw new Error(`row ${i + 1}: unknown field; use input, reference_output (or expected), rubric and label`);
    }
    const references = ["reference_output", "referenceOutput", "expected"].filter(key => Object.hasOwn(row, key));
    if (references.length > 1 && references.some(key => row[key] !== row[references[0]!])) {
      throw new Error(`row ${i + 1}: conflicting reference fields; provide only reference_output or expected`);
    }
    const parsed = GoldenExampleInputSchema.safeParse({
      input: row.input,
      referenceOutput: references.length ? row[references[0]!] : null,
      rubric: row.rubric ?? null,
      label: row.label ?? "unlabeled",
    });
    if (!parsed.success) {
      throw new Error(`row ${i + 1}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    }
    return parsed.data;
  });
}
