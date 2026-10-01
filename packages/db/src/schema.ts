import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  CaptureMode,
  BetaFeedbackImpact,
  BetaFeedbackStage,
  DriftSource,
  Evidence,
  EvalCriterionScore,
  EvalExecutionMode,
  EvalPlanDisclosure,
  EvalPlanStatus,
  EvalScoreMethod,
  ModelAvailability,
  ModelCapabilities,
  ModelProbeStatus,
  ModelRegistrySource,
  NodeRequirements,
  Policy,
  WorkflowContextManifest,
  WorkflowIntegrationMode,
} from "@blindspot/shared";

// Blindspot lives in its own Postgres schema so it never collides with (or introspects)
// other tables in a shared database. drizzle.config sets schemaFilter to match.
export const bs = pgSchema("blindspot");

// --- enums ---------------------------------------------------------------
export const candidateSource = bs.enum("candidate_source", [
  "api",
  "hf",
  "aggregator",
  "local",
]);
export const goldenOrigin = bs.enum("golden_origin", ["upload", "agent", "grown"]);
export const goldenLabel = bs.enum("golden_label", ["pass", "fail", "unlabeled"]);
export const recommendationStatus = bs.enum("recommendation_status", [
  "pending",
  "approved",
  "rejected",
]);
export const driftAction = bs.enum("drift_action", [
  "recommended",
  "auto_approved",
  "none",
]);
export const providerName = bs.enum("provider_name", [
  "anthropic",
  "openai",
  "gemini",
  "groq",
  "hf",
  "fireworks",
  "openrouter",
  "together",
  "ollama",
]);
export const captureMode = bs.enum("capture_mode", ["metadata", "inputs", "full"]);
export const workflowNodeKind = bs.enum("workflow_node_kind", [
  "agent",
  "generation",
  "tool",
  "retrieval",
  "function",
]);
export const workflowExecutionStatus = bs.enum("workflow_execution_status", [
  "running",
  "completed",
  "error",
]);
export const workflowSpanStatus = bs.enum("workflow_span_status", ["ok", "error"]);
export const executionFeedbackKind = bs.enum("execution_feedback_kind", [
  "up",
  "down",
  "score",
]);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// --- tables (PRD §9) -----------------------------------------------------
export const projects = bs.table("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  /** Content retention is a user decision; metadata-only is the privacy-safe default. */
  captureMode: captureMode("capture_mode").$type<CaptureMode>().notNull().default("metadata"),
  createdAt: createdAt(),
});

/** Project-scoped private-beta feedback; never accepts attachments or implicit telemetry. */
export const betaFeedback = bs.table(
  "beta_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    stage: text("stage").$type<BetaFeedbackStage>().notNull(),
    attempted: text("attempted").notNull(),
    expected: text("expected").notNull(),
    actual: text("actual").notNull(),
    impact: text("impact").$type<BetaFeedbackImpact>().notNull(),
    framework: text("framework"),
    captureMode: text("capture_mode"),
    createdAt: createdAt(),
  },
  (t) => [index("beta_feedback_project_created_idx").on(t.projectId, t.createdAt)],
);

/** App-issued gateway keys (bs_live_…). We store only a hash + a shown-once prefix. */
export const apiKeys = bs.table(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: text("scopes").array().notNull().default(["completion", "telemetry", "feedback"]),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("api_keys_key_hash_idx").on(t.keyHash)],
);

/** BYO provider keys, encrypted at rest (AES-256-GCM). One per provider per project. */
export const providerKeys = bs.table(
  "provider_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: providerName("provider").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("provider_keys_project_provider_idx").on(t.projectId, t.provider),
  ],
);

/**
 * Project-scoped provider catalog. Availability is scoped to the user's BYO account:
 * a model listed for one project is never assumed to be callable by another.
 */
export const modelRegistry = bs.table(
  "model_registry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: providerName("provider").notNull(),
    modelRef: text("model_ref").notNull(),
    providerModelId: text("provider_model_id").notNull(),
    displayName: text("display_name").notNull(),
    source: text("source").$type<ModelRegistrySource>().notNull().default("provider"),
    availability: text("availability")
      .$type<ModelAvailability>()
      .notNull()
      .default("available"),
    capabilitiesJson: jsonb("capabilities_json").$type<ModelCapabilities>().notNull(),
    inputUsdPerMillion: real("input_usd_per_million"),
    outputUsdPerMillion: real("output_usd_per_million"),
    providerCreatedAt: timestamp("provider_created_at", { withTimezone: true }),
    deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
    lastProbedAt: timestamp("last_probed_at", { withTimezone: true }),
    probeStatus: text("probe_status")
      .$type<ModelProbeStatus>()
      .notNull()
      .default("unverified"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("model_registry_project_model_idx").on(t.projectId, t.modelRef),
    index("model_registry_project_provider_idx").on(t.projectId, t.provider),
  ],
);

export const routes = bs.table(
  "routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** null until a candidate is approved for this route. */
    liveModel: text("live_model"),
    policyJson: jsonb("policy_json").$type<Policy>().notNull(),
    autoApprove: boolean("auto_approve").notNull().default(false),
    exampleKind: text("example_kind"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("routes_project_name_idx").on(t.projectId, t.name)],
);

export const candidates = bs.table(
  "candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    modelRef: text("model_ref").notNull(),
    source: candidateSource("source").notNull().default("api"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("candidates_route_model_idx").on(t.routeId, t.modelRef)],
);

export const goldenSets = bs.table(
  "golden_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    origin: goldenOrigin("origin").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("golden_sets_route_version_idx").on(t.routeId, t.version)],
);

export const goldenExamples = bs.table("golden_examples", {
  id: uuid("id").primaryKey().defaultRandom(),
  goldenSetId: uuid("golden_set_id")
    .notNull()
    .references(() => goldenSets.id, { onDelete: "cascade" }),
  input: text("input").notNull(),
  referenceOutput: text("reference_output"),
  rubric: text("rubric"),
  label: goldenLabel("label").notNull().default("unlabeled"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/** Immutable estimate + disclosed sample. A paid run can start only from a confirmed draft. */
export const evalPlans = bs.table(
  "eval_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    goldenSetId: uuid("golden_set_id")
      .notNull()
      .references(() => goldenSets.id, { onDelete: "cascade" }),
    status: text("status").$type<EvalPlanStatus>().notNull().default("draft"),
    executionMode: text("execution_mode")
      .$type<EvalExecutionMode>()
      .notNull()
      .default("model_only"),
    modelRefsJson: jsonb("model_refs_json").$type<string[]>().notNull(),
    judgeModel: text("judge_model").notNull(),
    budgetCents: real("budget_cents").notNull(),
    fullEstimatedCostCents: real("full_estimated_cost_cents").notNull(),
    selectedEstimatedCostCents: real("selected_estimated_cost_cents").notNull(),
    sampleSeed: text("sample_seed").notNull(),
    selectionHash: text("selection_hash").notNull(),
    disclosureJson: jsonb("disclosure_json").$type<EvalPlanDisclosure>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    actualCostCents: real("actual_cost_cents"),
    createdAt: createdAt(),
  },
  (t) => [
    index("eval_plans_project_route_idx").on(t.projectId, t.routeId),
    index("eval_plans_status_expires_idx").on(t.status, t.expiresAt),
  ],
);

export const evalRuns = bs.table(
  "eval_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => evalPlans.id, { onDelete: "set null" }),
    modelRef: text("model_ref").notNull(),
    goldenSetVersion: integer("golden_set_version").notNull(),
    status: text("status").$type<"running" | "completed" | "failed">().notNull().default("completed"),
    executionMode: text("execution_mode")
      .$type<EvalExecutionMode>()
      .notNull()
      .default("model_only"),
    scoreMethod: text("score_method")
      .$type<EvalScoreMethod>()
      .notNull()
      .default("legacy_judge_overall"),
    avgScore: real("avg_score"),
    /** USD cents per 1k tokens (all money is cents). */
    costPer1k: real("cost_per_1k"),
    latencyMs: integer("latency_ms"),
    examplesPlanned: integer("examples_planned").notNull().default(0),
    examplesScored: integer("examples_scored").notNull().default(0),
    examplesFailed: integer("examples_failed").notNull().default(0),
    estimatedCostCents: real("estimated_cost_cents"),
    actualCostCents: real("actual_cost_cents"),
    sampleSeed: text("sample_seed"),
    createdAt: createdAt(),
  },
  (t) => [index("eval_runs_route_idx").on(t.routeId)],
);

/** Stable per-example evidence used by issue views and Recommendations. */
export const evalExampleResults = bs.table(
  "eval_example_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evalRunId: uuid("eval_run_id")
      .notNull()
      .references(() => evalRuns.id, { onDelete: "cascade" }),
    goldenExampleId: uuid("golden_example_id").references(() => goldenExamples.id, {
      onDelete: "set null",
    }),
    input: text("input").notNull(),
    referenceOutput: text("reference_output"),
    candidateOutput: text("candidate_output"),
    score: real("score"),
    perCriterionJson: jsonb("per_criterion_json").$type<EvalCriterionScore[]>().notNull().default([]),
    reasoning: text("reasoning"),
    issuesJson: jsonb("issues_json").$type<string[]>().notNull().default([]),
    latencyMs: integer("latency_ms"),
    candidateCostCents: real("candidate_cost_cents"),
    judgeCostCents: real("judge_cost_cents"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [
    index("eval_example_results_run_idx").on(t.evalRunId),
    index("eval_example_results_example_idx").on(t.goldenExampleId),
  ],
);

export const recommendations = bs.table(
  "recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    fromModel: text("from_model"),
    toModel: text("to_model").notNull(),
    evidenceJson: jsonb("evidence_json").$type<Evidence>().notNull(),
    status: recommendationStatus("status").notNull().default("pending"),
    /** rejection reason — tunes future recommendations (PRD §3). */
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("recommendations_route_status_idx").on(t.routeId, t.status)],
);

export const driftEvents = bs.table("drift_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  routeId: uuid("route_id")
    .notNull()
    .references(() => routes.id, { onDelete: "cascade" }),
  modelRef: text("model_ref").notNull(),
  oldScore: real("old_score"),
  newScore: real("new_score").notNull(),
  action: driftAction("action").notNull().default("recommended"),
  source: text("source").$type<DriftSource>().notNull().default("simulation"),
  createdAt: createdAt(),
});

export const traces = bs.table(
  "traces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    routeId: uuid("route_id").references(() => routes.id, {
      onDelete: "set null",
    }),
    model: text("model").notNull(),
    input: jsonb("input").notNull(),
    output: text("output"),
    costCents: real("cost_cents"),
    latencyMs: integer("latency_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("traces_route_idx").on(t.routeId)],
);

// --- agent-workflow observability ---------------------------------------
// These tables preserve the workflow/node hierarchy that a flat gateway trace cannot express.
// Generation nodes link to the existing Route object so the current eval/approval loop is reused.
export const workflows = bs.table(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    framework: text("framework"),
    language: text("language"),
    environment: text("environment").notNull().default("production"),
    integrationMode: text("integration_mode")
      .$type<WorkflowIntegrationMode>()
      .notNull()
      .default("observe_only"),
    /** Discovered workflows are inert until the user selects them for optimization. */
    selected: boolean("selected").notNull().default(false),
    exampleKind: text("example_kind"),
    contextManifestJson: jsonb("context_manifest_json").$type<WorkflowContextManifest>(),
    contextHash: text("context_hash"),
    contextSharedAt: timestamp("context_shared_at", { withTimezone: true }),
    replayUrl: text("replay_url"),
    replaySecretEncrypted: text("replay_secret_encrypted"),
    replayEnabled: boolean("replay_enabled").notNull().default(false),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("workflows_project_name_env_idx").on(t.projectId, t.name, t.environment),
    index("workflows_project_last_seen_idx").on(t.projectId, t.lastSeenAt),
  ],
);

export const workflowNodes = bs.table(
  "workflow_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    routeId: uuid("route_id").references(() => routes.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    kind: workflowNodeKind("kind").notNull().default("generation"),
    latestModel: text("latest_model"),
    requirementsJson: jsonb("requirements_json").$type<NodeRequirements>().notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("workflow_nodes_workflow_name_idx").on(t.workflowId, t.name)],
);

export const workflowExecutions = bs.table(
  "workflow_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    sessionId: text("session_id"),
    status: workflowExecutionStatus("status").notNull().default("running"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("workflow_executions_workflow_external_idx").on(t.workflowId, t.externalId),
    index("workflow_executions_workflow_started_idx").on(t.workflowId, t.startedAt),
  ],
);

export const workflowSpans = bs.table(
  "workflow_spans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => workflowExecutions.id, { onDelete: "cascade" }),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => workflowNodes.id, { onDelete: "cascade" }),
    traceId: uuid("trace_id").references(() => traces.id, { onDelete: "set null" }),
    externalId: text("external_id").notNull(),
    parentExternalId: text("parent_external_id"),
    model: text("model"),
    status: workflowSpanStatus("status").notNull().default("ok"),
    captureMode: captureMode("capture_mode").$type<CaptureMode>().notNull(),
    inputJson: jsonb("input_json"),
    outputJson: jsonb("output_json"),
    inputBytes: integer("input_bytes"),
    outputBytes: integer("output_bytes"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costCents: real("cost_cents"),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("workflow_spans_execution_external_idx").on(t.executionId, t.externalId),
    index("workflow_spans_node_created_idx").on(t.nodeId, t.createdAt),
  ],
);

/**
 * End-user feedback on an agent execution (👍/👎/score). App-supplied and metadata-safe:
 * only the optional `comment` is content. Linked to a workflow by name+environment at write
 * time; `executionExternalId` is the app's own execution id (matches workflowExecutions.externalId).
 */
export const executionFeedback = bs.table(
  "execution_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: "set null" }),
    executionExternalId: text("execution_external_id").notNull(),
    nodeName: text("node_name"),
    kind: executionFeedbackKind("kind").notNull(),
    value: real("value"),
    comment: text("comment"),
    createdAt: createdAt(),
  },
  (t) => [
    index("execution_feedback_project_created_idx").on(t.projectId, t.createdAt),
    index("execution_feedback_workflow_created_idx").on(t.workflowId, t.createdAt),
  ],
);
