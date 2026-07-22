// Typed, server-side client for the Blindspot /v1 gateway. Every call carries the
// project's bs_live_ key as a bearer token. This module is only ever imported by
// Server Components / Server Actions, so the key never reaches the browser.

import type {
  DriftEvent,
  EvalPlan,
  EvalRunEvidence,
  GatewayKey,
  GoldenExample,
  GoldenSet,
  MetricsWindow,
  MintedKey,
  ModelRegistryOverview,
  Overview,
  Project,
  ProviderKey,
  Recommendation,
  RouteDetail,
  RouteModelCompatibility,
  RouteSummary,
  Settings,
  Trace,
  CaptureMode,
  BetaFeedback,
  BetaFeedbackImpact,
  BetaFeedbackStage,
  EvalExecutionMode,
  RouteWorkflowContext,
  WorkflowDetail,
  WorkflowMetrics,
  WorkflowSummary,
} from "./types";

export const GATEWAY_URL = process.env.BLINDSPOT_GATEWAY_URL ?? "http://localhost:8787";

// FMEA P2 (config drift): defaulting to localhost in production almost always means a
// missing env var — the whole dashboard would show "gateway down". Make it loud.
if (!process.env.BLINDSPOT_GATEWAY_URL && process.env.NODE_ENV === "production") {
  console.warn(
    "[dashboard] BLINDSPOT_GATEWAY_URL is not set — defaulting to http://localhost:8787 in production.",
  );
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function req<T>(key: string, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_URL}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, `cannot reach the gateway at ${GATEWAY_URL}`);
  }
  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // gateway returned non-JSON (proxy error page, crash, HTML) — don't blow up JSON.parse
      throw new ApiError(res.status, `gateway returned a non-JSON response (${res.status})`);
    }
  }
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } })?.error?.message ?? res.statusText;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export interface Page {
  limit?: number;
  offset?: number;
}

/** Build a typed client bound to one project key. */
export function api(key: string) {
  const get = <T>(path: string, init?: RequestInit) => req<T>(key, path, init);
  const send = <T>(method: string, path: string, body?: unknown) =>
    req<T>(key, path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

  return {
    // identity + summary
    me: (init?: RequestInit) => get<{ project: Project }>("/v1/me", init),
    overview: () => get<Overview>("/v1/overview"),
    metrics: (p: { workflowId: string; nodeId?: string; window?: MetricsWindow }) =>
      get<WorkflowMetrics>(
        `/v1/metrics${qs({ workflowId: p.workflowId, nodeId: p.nodeId, window: p.window })}`,
      ),
    settings: () => get<Settings>("/v1/settings"),

    // routes
    listRoutes: (p: Page = {}) =>
      get<{ routes: RouteSummary[]; total: number }>(
        `/v1/routes${qs({ limit: p.limit, offset: p.offset })}`,
      ),
    getRoute: (name: string) => get<RouteDetail>(`/v1/routes/${encodeURIComponent(name)}`),
    getRouteCompatibility: (name: string) =>
      get<RouteModelCompatibility>(
        `/v1/routes/${encodeURIComponent(name)}/model-compatibility`,
      ),
    patchRoute: (name: string, body: { minScore?: number; autoApprove?: boolean }) =>
      send<{ route: unknown }>("PATCH", `/v1/routes/${encodeURIComponent(name)}`, body),
    addCandidate: (name: string, body: { modelRef: string; source?: string }) =>
      send<unknown>("POST", `/v1/routes/${encodeURIComponent(name)}/candidates`, body),
    removeCandidate: (name: string, modelRef: string) =>
      send<{ ok: true }>(
        "DELETE",
        `/v1/routes/${encodeURIComponent(name)}/candidates/${encodeURIComponent(modelRef)}`,
      ),

    // traces
    listTraces: (p: Page & { route?: string } = {}) =>
      get<{ traces: Trace[]; limit: number; offset: number }>(
        `/v1/traces${qs({ limit: p.limit, offset: p.offset, route: p.route })}`,
      ),

    // discovered agentic workflows + project-level data controls
    listWorkflows: () => get<{ workflows: WorkflowSummary[] }>("/v1/workflows"),
    getWorkflow: (id: string) => get<WorkflowDetail>(`/v1/workflows/${id}`),
    selectWorkflow: (id: string, selected: boolean) =>
      send<{ workflow: WorkflowSummary }>("PATCH", `/v1/workflows/${id}`, { selected }),
    configureWorkflowReplay: (
      id: string,
      body: { url: string; secret?: string; enabled: boolean },
    ) =>
      send<{ workflow: WorkflowSummary }>("PUT", `/v1/workflows/${id}/replay`, body),
    getDataControls: () => get<{ captureMode: CaptureMode }>("/v1/data-controls"),
    setDataControls: (captureMode: CaptureMode) =>
      send<{ captureMode: CaptureMode }>("PATCH", "/v1/data-controls", { captureMode }),
    getRouteWorkflowContext: (name: string) =>
      get<{ workflow_context: RouteWorkflowContext | null }>(
        `/v1/routes/${encodeURIComponent(name)}/workflow-context`,
      ),

    // approvals
    listRecommendations: (p: Page & { status?: string } = {}) =>
      get<{ recommendations: Recommendation[] }>(
        `/v1/recommendations${qs({ limit: p.limit, offset: p.offset, status: p.status })}`,
      ),
    recommend: (name: string) =>
      send<{ recommendation: Recommendation | null; note?: string }>(
        "POST",
        `/v1/routes/${encodeURIComponent(name)}/recommend`,
      ),
    approve: (id: string) =>
      send<{ recommendation: Recommendation }>("POST", `/v1/recommendations/${id}/approve`),
    reject: (id: string, reason?: string) =>
      send<{ recommendation: Recommendation }>("POST", `/v1/recommendations/${id}/reject`, {
        reason,
      }),

    // budget-authorized evals
    createEvalPlan: (
      name: string,
      body: { modelRefs: string[]; budgetUsd: number; executionMode?: EvalExecutionMode },
    ) =>
      send<{ plan: EvalPlan }>(
        "POST",
        `/v1/routes/${encodeURIComponent(name)}/eval-plans`,
        body,
      ),
    runEvalPlan: (planId: string) =>
      send<{ result: { plan: EvalPlan; runs: unknown[]; recommendation: Recommendation | null } }>(
        "POST",
        `/v1/eval-plans/${planId}/run`,
        { confirm: true },
      ),
    evalEvidence: (name: string) =>
      get<{ runs: EvalRunEvidence[] }>(
        `/v1/routes/${encodeURIComponent(name)}/eval-evidence`,
      ),

    // drift + gate
    driftEvents: (p: Page = {}) =>
      get<{ drift_events: DriftEvent[] }>(
        `/v1/drift-events${qs({ limit: p.limit, offset: p.offset })}`,
      ),
    driftCheck: (name: string, body: { simulateNewScore?: number; margin?: number }) =>
      send<unknown>("POST", `/v1/routes/${encodeURIComponent(name)}/drift-check`, body),

    // explicit, project-scoped private-beta feedback
    listBetaFeedback: () => get<{ feedback: BetaFeedback[] }>("/v1/beta-feedback"),
    submitBetaFeedback: (body: {
      stage: BetaFeedbackStage;
      attempted: string;
      expected: string;
      actual: string;
      impact: BetaFeedbackImpact;
      framework?: string;
      captureMode?: CaptureMode | "not_sure";
      confirmSafe: true;
    }) => send<{ feedback: BetaFeedback }>("POST", "/v1/beta-feedback", body),

    // golden sets
    listGoldenSets: (name: string) =>
      get<{ golden_sets: GoldenSet[] }>(`/v1/routes/${encodeURIComponent(name)}/golden-sets`),
    listExamples: (setId: string) =>
      get<{ examples: GoldenExample[] }>(`/v1/golden-sets/${setId}/examples`),
    uploadGolden: (name: string, body: { format: "csv" | "json" | "jsonl"; data: string }) =>
      send<{ golden_set: GoldenSet; count: number }>(
        "POST",
        `/v1/routes/${encodeURIComponent(name)}/golden-sets/upload`,
        body,
      ),
    generateGolden: (
      name: string,
      body: {
        taskDescription?: string;
        productBrief?: string;
        systemPrompt?: string;
        architecture?: string;
        useLiveTraces?: boolean;
        count?: number;
      },
    ) =>
      send<{ golden_set: GoldenSet; count: number }>(
        "POST",
        `/v1/routes/${encodeURIComponent(name)}/golden-sets/generate`,
        body,
      ),
    addExample: (
      setId: string,
      body: { input: string; referenceOutput?: string | null; rubric?: string | null; label?: string },
    ) => send<{ example: GoldenExample }>("POST", `/v1/golden-sets/${setId}/examples`, body),
    updateExample: (
      exId: string,
      body: Partial<{ input: string; referenceOutput: string | null; rubric: string | null; label: string; active: boolean }>,
    ) => send<{ example: GoldenExample }>("PATCH", `/v1/golden-examples/${exId}`, body),
    deleteExample: (exId: string) => send<{ ok: true }>("DELETE", `/v1/golden-examples/${exId}`),
    promoteTrace: (setId: string, traceId: string) =>
      send<{ example: GoldenExample }>("POST", `/v1/golden-sets/${setId}/promote-trace`, {
        traceId,
      }),

    // keys
    listGatewayKeys: () => get<{ keys: GatewayKey[] }>("/v1/keys"),
    createGatewayKey: () => send<{ key: MintedKey }>("POST", "/v1/keys"),
    deleteGatewayKey: (id: string) => send<{ ok: true }>("DELETE", `/v1/keys/${id}`),
    listProviderKeys: () => get<{ provider_keys: ProviderKey[] }>("/v1/provider-keys"),
    setProviderKey: (provider: string, value: string) =>
      send<{ provider_key: ProviderKey }>("PUT", `/v1/provider-keys/${provider}`, { value }),
    deleteProviderKey: (provider: string) =>
      send<{ ok: true }>("DELETE", `/v1/provider-keys/${provider}`),
    modelRegistry: () => get<ModelRegistryOverview>("/v1/model-registry"),
    syncModelRegistry: (provider: "anthropic" | "hf" | "fireworks") =>
      send<{
        sync: {
          provider: string;
          discovered: number;
          prototypeModels: number;
          syncedAt: string;
          tokenCost: 0;
        };
      }>("POST", "/v1/model-registry/sync", { provider }),
  };
}

export type Client = ReturnType<typeof api>;
