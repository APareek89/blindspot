// Response shapes for the Blindspot /v1 API. The dashboard is a pure HTTP client —
// these mirror @blindspot/core return types without importing the server package.

export type RouteStatus = "healthy" | "at_risk" | "unevaluated";
export type GoldenOrigin = "upload" | "agent" | "grown";
export type GoldenLabel = "pass" | "fail" | "unlabeled";
export type RecStatus = "pending" | "approved" | "rejected";
export type CaptureMode = "metadata" | "inputs" | "full";

export interface Policy {
  type: "cheapest_passing";
  minScore: number;
}

export interface Project {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
}

export interface CostQualityPoint {
  routeName: string;
  costPer1kCents: number | null;
  quality: number | null;
  status: RouteStatus;
}

export interface Activity {
  kind: "recommendation" | "drift";
  routeName: string;
  at: string;
  detail: string;
  status?: string;
}

export interface Overview {
  avgQuality: number | null;
  savedCentsPer1kRealized: number;
  savedCentsPer1kPending: number;
  pendingApprovals: number;
  driftAlerts: number;
  routesHealthy: number;
  routesAtRisk: number;
  routesUnevaluated: number;
  routeCount: number;
  costVsQuality: CostQualityPoint[];
  activity: Activity[];
}

export interface RouteSummary {
  id: string;
  name: string;
  liveModel: string | null;
  policy: Policy;
  autoApprove: boolean;
  createdAt: string;
  quality: number | null;
  costPer1kCents: number | null;
  sparkline: number[];
  candidateCount: number;
  hasGoldenSet: boolean;
  pendingRecs: number;
  status: RouteStatus;
}

export interface CandidateDetail {
  id: string;
  modelRef: string;
  source: string;
  enabled: boolean;
  isLive: boolean;
  score: number | null;
  costPer1kCents: number | null;
  latencyMs: number | null;
  lastEvaluatedAt: string | null;
}

export interface GoldenSet {
  id: string;
  routeId: string;
  version: number;
  origin: GoldenOrigin;
  createdAt: string;
}

export interface RouteDetail {
  route: {
    id: string;
    name: string;
    liveModel: string | null;
    policy: Policy;
    autoApprove: boolean;
    createdAt: string;
    costPer1kCents: number | null;
  };
  candidates: CandidateDetail[];
  scoreSeries: { score: number; version: number; at: string }[];
  goldenSets: GoldenSet[];
  pendingRecs: number;
}

export interface GoldenExample {
  id: string;
  goldenSetId: string;
  input: string;
  referenceOutput: string | null;
  rubric: string | null;
  label: GoldenLabel;
  active: boolean;
  createdAt: string;
}

export interface Evidence {
  fromModel: string | null;
  toModel: string;
  fromScore: number | null;
  toScore: number;
  costDeltaPct: number;
  latencyDeltaMs: number | null;
  perCriterion: { criterion: string; from: number | null; to: number }[];
  samples: { input: string; fromOutput: string | null; toOutput: string }[];
}

export interface Recommendation {
  id: string;
  routeId: string;
  routeName: string;
  fromModel: string | null;
  toModel: string;
  evidenceJson: Evidence;
  status: RecStatus;
  reason: string | null;
  createdAt: string;
}

export interface DriftEvent {
  id: string;
  routeId: string;
  routeName: string;
  modelRef: string;
  oldScore: number | null;
  newScore: number;
  action: string;
  createdAt: string;
  recommendationId: string | null;
}

export interface Trace {
  id: string;
  routeId: string | null;
  routeName: string;
  model: string;
  input: unknown;
  output: string | null;
  costCents: number | null;
  latencyMs: number | null;
  createdAt: string;
}

export interface GatewayKey {
  id: string;
  prefix: string;
  createdAt: string;
}

export interface MintedKey extends GatewayKey {
  key: string;
}

export interface ProviderKey {
  provider: string;
  createdAt: string;
}

export interface Settings {
  costCapUsdPerEvalRun: number | null;
  defaultModel: string | null;
  judgeModel: string | null;
  evalMode: "inline" | "queued";
}

export interface ModelCapabilities {
  inputModalities: string[];
  outputModalities: string[];
  toolCalling: boolean | null;
  structuredOutput: boolean | null;
  streaming: boolean | null;
  systemMessages: boolean | null;
  contextTokens: number | null;
  maxOutputTokens: number | null;
}

export type CompatibilityStatus =
  | "compatible"
  | "needs_verification"
  | "needs_provider_key"
  | "incompatible"
  | "eval_failed";

export interface ModelCompatibility {
  modelRef: string;
  provider: "anthropic" | "hf" | "fireworks";
  displayName: string;
  status: CompatibilityStatus;
  reasons: string[];
  capabilities: ModelCapabilities;
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  lastSyncedAt: string | null;
}

export interface RouteModelCompatibility {
  route: { id: string; name: string; liveModel: string | null };
  workflow: {
    id: string;
    name: string;
    selected: boolean;
    nodeId: string;
    nodeName: string;
  } | null;
  optimizationAllowed: boolean;
  optimizationBlockedReason: string | null;
  requirements: {
    inputModalities: string[];
    outputModalities: string[];
    toolCalling: boolean;
    structuredOutput: boolean;
    streaming: boolean;
    systemMessages: boolean;
    minContextTokens?: number;
  };
  eligible: ModelCompatibility[];
  excluded: ModelCompatibility[];
}

export interface ModelRegistryOverview {
  providers: Array<{
    provider: "anthropic" | "hf" | "fireworks";
    keyConfigured: boolean;
    modelCount: number;
    verifiedCount: number;
    lastSyncedAt: string | null;
  }>;
  models: Array<{
    id: string;
    provider: string;
    modelRef: string;
    displayName: string;
    availability: "available" | "unavailable" | "deprecated";
    capabilities: ModelCapabilities;
    probeStatus: "unverified" | "verified" | "failed";
    lastSyncedAt: string;
  }>;
}

export interface EvalPlanDisclosure {
  mode: "full" | "sampled";
  models: string[];
  judgeModel: string;
  goldenSetVersion: number;
  fullExampleCount: number;
  selectedExampleIds: string[];
  selectedExamples: Array<{
    id: string;
    input: string;
    referenceOutput: string | null;
    rubric: string | null;
    label: GoldenLabel;
    active: true;
  }>;
  omittedExamples: Array<{ id: string; input: string; label: GoldenLabel }>;
  omittedExampleCount: number;
  strataSelected: Record<"must_pass" | "known_failure" | "edge" | "representative", number>;
  strataAvailable: Record<"must_pass" | "known_failure" | "edge" | "representative", number>;
  seed: string;
  budgetCents: number;
  fullEstimatedCostCents: number;
  selectedEstimatedCostCents: number;
  minimumBudgetCents: number;
  modelEstimates: Array<{ modelRef: string; estimatedCostCents: number; calls: number }>;
  safetyMethod: string;
  confidenceNote: string;
}

export interface EvalPlan {
  id: string;
  projectId: string;
  routeId: string;
  goldenSetId: string;
  status: "draft" | "running" | "completed" | "failed" | "expired";
  modelRefsJson: string[];
  judgeModel: string;
  budgetCents: number;
  fullEstimatedCostCents: number;
  selectedEstimatedCostCents: number;
  sampleSeed: string;
  expiresAt: string;
  actualCostCents: number | null;
  failureReason: string | null;
  createdAt: string;
  disclosure: EvalPlanDisclosure;
}

export interface EvalExampleEvidence {
  id: string;
  evalRunId: string;
  goldenExampleId: string | null;
  input: string;
  referenceOutput: string | null;
  candidateOutput: string | null;
  score: number | null;
  perCriterionJson: Array<{ criterion: string; score: number }>;
  reasoning: string | null;
  issuesJson: string[];
  latencyMs: number | null;
  candidateCostCents: number | null;
  judgeCostCents: number | null;
  error: string | null;
  createdAt: string;
}

export interface EvalRunEvidence {
  id: string;
  routeId: string;
  planId: string | null;
  modelRef: string;
  goldenSetVersion: number;
  status: "running" | "completed" | "failed";
  avgScore: number | null;
  costPer1k: number | null;
  latencyMs: number | null;
  examplesPlanned: number;
  examplesScored: number;
  examplesFailed: number;
  estimatedCostCents: number | null;
  actualCostCents: number | null;
  sampleSeed: string | null;
  createdAt: string;
  examples: EvalExampleEvidence[];
}

export interface WorkflowSummary {
  id: string;
  projectId: string;
  name: string;
  framework: string | null;
  language: string | null;
  environment: string;
  selected: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  nodeCount: number;
  executionCount: number;
}

export interface WorkflowNodeDetail {
  id: string;
  routeId: string | null;
  name: string;
  kind: "agent" | "generation" | "tool" | "retrieval" | "function";
  latestModel: string | null;
  requirements: {
    inputModalities: string[];
    outputModalities: string[];
    toolCalling: boolean;
    structuredOutput: boolean;
    streaming: boolean;
    systemMessages: boolean;
    minContextTokens?: number;
  };
  firstSeenAt: string;
  lastSeenAt: string;
  spanCount: number;
  avgLatencyMs: number | null;
  totalCostCents: number;
  errorCount: number;
}

export interface WorkflowDetail {
  workflow: WorkflowSummary;
  nodes: WorkflowNodeDetail[];
}

/** Providers the gateway can route to (mirrors @blindspot/shared PROVIDERS). */
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
export type Provider = (typeof PROVIDERS)[number];
