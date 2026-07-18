import { estimateCostCents } from "@blindspot/providers";

export const CANDIDATE_MAX_OUTPUT_TOKENS = 384;
export const JUDGE_MAX_OUTPUT_TOKENS = 384;
const ESTIMATE_SAFETY_MULTIPLIER = 1.15;

function conservativeTextTokens(value: string | null): number {
  if (!value) return 0;
  // A token cannot contain more information than the UTF-8 bytes carrying it. This intentionally
  // over-estimates normal English (~4 chars/token) so the authorized cap is fail-safe.
  return Buffer.byteLength(value, "utf8");
}

export interface CostableGoldenExample {
  id: string;
  input: string;
  referenceOutput: string | null;
  rubric: string | null;
}

export function estimateExampleModelCostCents(
  example: CostableGoldenExample,
  modelRef: string,
  judgeModel: string,
): number {
  const candidateInputTokens = conservativeTextTokens(example.input) + 64;
  const candidateCost = estimateCostCents(
    modelRef,
    candidateInputTokens,
    CANDIDATE_MAX_OUTPUT_TOKENS,
  );
  const judgeInputTokens =
    conservativeTextTokens(example.input) +
    conservativeTextTokens(example.referenceOutput) +
    conservativeTextTokens(example.rubric) +
    CANDIDATE_MAX_OUTPUT_TOKENS +
    450;
  const judgeCost = estimateCostCents(
    judgeModel,
    judgeInputTokens,
    JUDGE_MAX_OUTPUT_TOKENS,
  );
  if (candidateCost == null) throw new Error(`pricing unavailable for ${modelRef}`);
  if (judgeCost == null) throw new Error(`pricing unavailable for judge ${judgeModel}`);
  return Math.max((candidateCost + judgeCost) * ESTIMATE_SAFETY_MULTIPLIER, 0.000001);
}

export const EVAL_ESTIMATE_SAFETY_METHOD =
  "UTF-8-byte upper-bound input estimate + fixed 384-token candidate/judge output ceilings + 15% safety margin";
