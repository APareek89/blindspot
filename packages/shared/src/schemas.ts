import { z } from "zod";

/** Providers we can route to (BYO keys, PRD §5). */
export const PROVIDERS = [
  "anthropic",
  "openai",
  "gemini",
  "groq",
  "hf",
  "fireworks",
  "openrouter",
  "together",
  "ollama",
] as const;
export const ProviderSchema = z.enum(PROVIDERS);
export type Provider = (typeof PROVIDERS)[number];

/** How much application content Blindspot may retain for a project. */
export const CaptureModeSchema = z.enum(["metadata", "inputs", "full"]);
export type CaptureMode = z.infer<typeof CaptureModeSchema>;

/** The kinds of steps that can appear in an agentic workflow trace. */
export const WorkflowNodeKindSchema = z.enum([
  "agent",
  "generation",
  "tool",
  "retrieval",
  "function",
]);
export type WorkflowNodeKind = z.infer<typeof WorkflowNodeKindSchema>;

export const WorkflowSpanStatusSchema = z.enum(["ok", "error"]);
export type WorkflowSpanStatus = z.infer<typeof WorkflowSpanStatusSchema>;

/** Requirements observed at a node. The compatibility engine will match models to these. */
export const NodeRequirementsSchema = z
  .object({
    inputModalities: z.array(z.enum(["text", "image", "audio", "video"])).default(["text"]),
    outputModalities: z.array(z.enum(["text", "image", "audio"])).default(["text"]),
    toolCalling: z.boolean().default(false),
    structuredOutput: z.boolean().default(false),
    streaming: z.boolean().default(false),
    systemMessages: z.boolean().default(false),
    minContextTokens: z.number().int().nonnegative().optional(),
  })
  .default({});
export type NodeRequirements = z.infer<typeof NodeRequirementsSchema>;

/** Normalized provider capability metadata. null means the provider did not make a claim. */
export const ModelCapabilitiesSchema = z.object({
  inputModalities: z.array(z.enum(["text", "image", "audio", "video"])).default(["text"]),
  outputModalities: z.array(z.enum(["text", "image", "audio"])).default(["text"]),
  toolCalling: z.boolean().nullable().default(null),
  structuredOutput: z.boolean().nullable().default(null),
  streaming: z.boolean().nullable().default(null),
  systemMessages: z.boolean().nullable().default(null),
  contextTokens: z.number().int().positive().nullable().default(null),
  maxOutputTokens: z.number().int().positive().nullable().default(null),
});
export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;

export const ModelRegistrySourceSchema = z.enum(["provider", "curated", "probe"]);
export type ModelRegistrySource = z.infer<typeof ModelRegistrySourceSchema>;

export const ModelAvailabilitySchema = z.enum(["available", "unavailable", "deprecated"]);
export type ModelAvailability = z.infer<typeof ModelAvailabilitySchema>;

export const ModelProbeStatusSchema = z.enum(["unverified", "verified", "failed"]);
export type ModelProbeStatus = z.infer<typeof ModelProbeStatusSchema>;

export const CompatibilityStatusSchema = z.enum([
  "compatible",
  "needs_verification",
  "needs_provider_key",
  "incompatible",
  "eval_failed",
]);
export type CompatibilityStatus = z.infer<typeof CompatibilityStatusSchema>;

/** Only the provider adapters wired for the agent-workspace prototype may be synchronized. */
export const RegistryProviderSchema = z.enum(["anthropic", "hf", "fireworks"]);
export type RegistryProvider = z.infer<typeof RegistryProviderSchema>;

export const ModelRegistrySyncInputSchema = z.object({ provider: RegistryProviderSchema });
export const ModelProbeInputSchema = z.object({ modelRef: z.string().trim().min(3).max(300) });

export const EvalPlanStatusSchema = z.enum([
  "draft",
  "running",
  "completed",
  "failed",
  "expired",
]);
export type EvalPlanStatus = z.infer<typeof EvalPlanStatusSchema>;

export const EvalSampleStratumSchema = z.enum([
  "must_pass",
  "known_failure",
  "edge",
  "representative",
]);
export type EvalSampleStratum = z.infer<typeof EvalSampleStratumSchema>;

const EvalModelEstimateSchema = z.object({
  modelRef: z.string(),
  estimatedCostCents: z.number().nonnegative(),
  calls: z.number().int().nonnegative(),
});

export const EvalPlannedExampleSchema = z.object({
  id: z.string().uuid(),
  input: z.string(),
  referenceOutput: z.string().nullable(),
  rubric: z.string().nullable(),
  label: z.enum(["pass", "fail", "unlabeled"]),
  active: z.literal(true),
});
export type EvalPlannedExample = z.infer<typeof EvalPlannedExampleSchema>;

const EvalPlanListedExampleSchema = EvalPlannedExampleSchema.pick({
  id: true,
  input: true,
  label: true,
});

export const EvalPlanDisclosureSchema = z.object({
  mode: z.enum(["full", "sampled"]),
  models: z.array(z.string()).min(1),
  judgeModel: z.string(),
  goldenSetVersion: z.number().int().positive(),
  fullExampleCount: z.number().int().positive(),
  selectedExampleIds: z.array(z.string().uuid()).min(1),
  selectedExamples: z.array(EvalPlannedExampleSchema).min(1),
  omittedExamples: z.array(EvalPlanListedExampleSchema),
  omittedExampleCount: z.number().int().nonnegative(),
  strataSelected: z.record(EvalSampleStratumSchema, z.number().int().nonnegative()),
  strataAvailable: z.record(EvalSampleStratumSchema, z.number().int().nonnegative()),
  seed: z.string().min(1),
  budgetCents: z.number().positive(),
  fullEstimatedCostCents: z.number().positive(),
  selectedEstimatedCostCents: z.number().positive(),
  minimumBudgetCents: z.number().positive(),
  modelEstimates: z.array(EvalModelEstimateSchema),
  perModelExampleCostCents: z.record(z.string(), z.record(z.string().uuid(), z.number().positive())),
  safetyMethod: z.string(),
  confidenceNote: z.string(),
});
export type EvalPlanDisclosure = z.infer<typeof EvalPlanDisclosureSchema>;

/** Estimate only: no provider inference occurs until a returned plan is explicitly confirmed. */
export const EvalPlanCreateInputSchema = z.object({
  modelRefs: z.array(z.string().trim().min(3).max(300)).min(1).max(4),
  budgetUsd: z.number().positive().max(100),
});
export type EvalPlanCreateInput = z.infer<typeof EvalPlanCreateInputSchema>;

export const EvalPlanRunInputSchema = z.object({
  planId: z.string().uuid(),
  confirm: z.literal(true),
});
export type EvalPlanRunInput = z.infer<typeof EvalPlanRunInputSchema>;

export const EvalCriterionScoreSchema = z.object({
  criterion: z.string(),
  score: z.number().min(0).max(1),
});
export type EvalCriterionScore = z.infer<typeof EvalCriterionScoreSchema>;

const JsonRecordSchema = z.record(z.unknown());

/** One SDK observation. Batches are capped again at the HTTP boundary. */
export const WorkflowSpanInputSchema = z.object({
  workflow: z.object({
    name: z.string().trim().min(1).max(120),
    framework: z.string().trim().max(80).optional(),
    language: z.string().trim().max(40).optional(),
    environment: z.string().trim().min(1).max(40).default("production"),
  }),
  execution: z.object({
    id: z.string().trim().min(1).max(200),
    sessionId: z.string().trim().max(200).optional(),
    status: z.enum(["running", "completed", "error"]).optional(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    metadata: JsonRecordSchema.optional(),
  }),
  span: z.object({
    id: z.string().trim().min(1).max(200),
    parentId: z.string().trim().max(200).optional(),
    node: z.string().trim().min(1).max(160),
    kind: WorkflowNodeKindSchema.default("generation"),
    provider: z.string().trim().max(40).optional(),
    model: z.string().trim().max(200).optional(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    status: WorkflowSpanStatusSchema.default("ok"),
    latencyMs: z.number().int().nonnegative().optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    costCents: z.number().nonnegative().optional(),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    error: z.string().max(2_000).optional(),
    metadata: JsonRecordSchema.optional(),
    requirements: NodeRequirementsSchema.optional(),
  }),
  /** The SDK can be stricter than the project policy; the server always chooses the stricter mode. */
  captureMode: CaptureModeSchema.default("metadata"),
});
export type WorkflowSpanInput = z.infer<typeof WorkflowSpanInputSchema>;

export const WorkflowSpanBatchSchema = z.object({
  spans: z.array(WorkflowSpanInputSchema).min(1).max(100),
});
export type WorkflowSpanBatch = z.infer<typeof WorkflowSpanBatchSchema>;

export const DataControlsPatchSchema = z.object({ captureMode: CaptureModeSchema });
export type DataControlsPatch = z.infer<typeof DataControlsPatchSchema>;

export const WorkflowPatchSchema = z.object({ selected: z.boolean() });
export type WorkflowPatch = z.infer<typeof WorkflowPatchSchema>;

/**
 * Policy — the rule for the *ideal* model (PRD §2). v1 = cheapest candidate whose
 * judge score is at/above the bar. Produces a Recommendation, never an auto-switch.
 */
export const PolicySchema = z.object({
  type: z.literal("cheapest_passing"),
  minScore: z.number().min(0).max(1),
});
export type Policy = z.infer<typeof PolicySchema>;
export const DEFAULT_POLICY: Policy = { type: "cheapest_passing", minScore: 0.85 };

/** Evidence carried by a Recommendation (PRD §3): deltas + per-criterion + samples. */
export const EvidenceSchema = z.object({
  fromModel: z.string().nullable(),
  toModel: z.string(),
  fromScore: z.number().nullable(),
  toScore: z.number(),
  /** cost change as a percent; negative = cheaper. */
  costDeltaPct: z.number(),
  latencyDeltaMs: z.number().nullable(),
  perCriterion: z.array(
    z.object({
      criterion: z.string(),
      from: z.number().nullable(),
      to: z.number(),
    }),
  ),
  samples: z.array(
    z.object({
      input: z.string(),
      fromOutput: z.string().nullable(),
      toOutput: z.string(),
    }),
  ),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

/** Minimal OpenAI-compatible chat-completions request (permissive; PRD §8 gateway). */
export const ChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatCompletionRequestSchema = z
  .object({
    model: z.string(),
    messages: z.array(ChatMessageSchema).min(1),
    temperature: z.number().optional(),
    max_tokens: z.number().int().positive().optional(),
    stream: z.boolean().optional(),
  })
  .passthrough();
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

/** How a route resolves `route:<name>` → concrete `provider:model`. */
export const ROUTE_PREFIX = "route:";

/** One golden example (PRD §7) — the unit that defines "good" for a route. */
export const GoldenExampleInputSchema = z.object({
  input: z.string().min(1),
  referenceOutput: z.string().nullish(),
  rubric: z.string().nullish(),
  label: z.enum(["pass", "fail", "unlabeled"]).default("unlabeled"),
});
export type GoldenExampleInput = z.infer<typeof GoldenExampleInputSchema>;

export const GoldenGenerateInputSchema = z.object({
  taskDescription: z.string().trim().max(10_000).optional(),
  productBrief: z.string().trim().max(50_000).optional(),
  systemPrompt: z.string().trim().max(50_000).optional(),
  architecture: z.string().trim().max(50_000).optional(),
  useLiveTraces: z.boolean().default(false),
  count: z.number().int().min(1).max(50).default(20),
});
export type GoldenGenerateInput = z.infer<typeof GoldenGenerateInputSchema>;

/** What the Golden Set Agent must return per generated example. */
export const GeneratedGoldenSchema = z.object({
  input: z.string().min(1),
  referenceOutput: z.string().min(1),
  rubric: z.string().min(1),
});
export type GeneratedGolden = z.infer<typeof GeneratedGoldenSchema>;

/** A judge's verdict for one candidate output vs a golden example (PRD §2 Judge). */
export const JudgeVerdictSchema = z.object({
  score: z.number().min(0).max(1),
  perCriterion: z
    .array(z.object({ criterion: z.string(), score: z.number().min(0).max(1) }))
    .default([]),
  reasoning: z.string().default(""),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

/** Edit a route's policy bar and/or per-route auto-approve toggle (PRD §10 route detail). */
export const RoutePatchSchema = z
  .object({
    minScore: z.number().min(0).max(1).optional(),
    autoApprove: z.boolean().optional(),
  })
  .refine((v) => v.minScore !== undefined || v.autoApprove !== undefined, {
    message: "provide minScore and/or autoApprove",
  });
export type RoutePatch = z.infer<typeof RoutePatchSchema>;

/** Set a project's BYO provider key (value is encrypted at rest; never echoed back). */
export const ProviderKeyInputSchema = z.object({
  value: z.string().min(1),
});
export type ProviderKeyInput = z.infer<typeof ProviderKeyInputSchema>;

/** Partial edit to a golden example (curate step, PRD §7). */
export const GoldenExamplePatchSchema = z.object({
  input: z.string().min(1).optional(),
  referenceOutput: z.string().nullable().optional(),
  rubric: z.string().nullable().optional(),
  label: z.enum(["pass", "fail", "unlabeled"]).optional(),
  active: z.boolean().optional(),
});
export type GoldenExamplePatch = z.infer<typeof GoldenExamplePatchSchema>;
