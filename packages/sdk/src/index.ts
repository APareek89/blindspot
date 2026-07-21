// Blindspot's lightweight TypeScript SDK records agent nodes without changing the model client.
// It batches best-effort telemetry in the background, never exposes provider keys, and defaults
// to metadata-only capture. Apps can call flush() at a request boundary for delivery certainty.

export type CaptureMode = "metadata" | "inputs" | "full";
export type IntegrationMode = "observe_only" | "managed";
export type NodeKind = "agent" | "generation" | "tool" | "retrieval" | "function";

export interface NodeRequirements {
  inputModalities?: ("text" | "image" | "audio" | "video")[];
  outputModalities?: ("text" | "image" | "audio")[];
  toolCalling?: boolean;
  structuredOutput?: boolean;
  streaming?: boolean;
  systemMessages?: boolean;
  minContextTokens?: number;
}

export interface BlindspotConfig {
  apiKey?: string;
  /** Gateway origin or /v1 base, for example http://localhost:8787. */
  baseUrl?: string;
  workflow: string;
  framework?: string;
  language?: string;
  environment?: string;
  captureMode?: CaptureMode;
  integrationMode?: IntegrationMode;
  flushIntervalMs?: number;
  onError?: (error: Error) => void;
}

export interface WorkflowContextManifest {
  version: string;
  productBrief?: string;
  architecture?: string;
  documents?: Array<{
    name: string;
    kind: "readme" | "design" | "prompt" | "architecture" | "other";
    content: string;
  }>;
}

export interface SpanStart {
  executionId: string;
  sessionId?: string;
  executionStartedAt?: Date;
  executionMetadata?: Record<string, unknown>;
  id?: string;
  parentId?: string;
  node: string;
  kind?: NodeKind;
  provider?: string;
  model?: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
  requirements?: NodeRequirements;
  startedAt?: Date;
}

export interface SpanEnd {
  output?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  costCents?: number;
  status?: "ok" | "error";
  error?: string;
  metadata?: Record<string, unknown>;
  endedAt?: Date;
  /** Mark the whole workflow execution terminal only when the application knows it is done. */
  executionStatus?: "completed" | "error";
  executionEndedAt?: Date;
}

interface WireSpan {
  workflow: {
    name: string;
    framework?: string;
    language?: string;
    environment: string;
    integrationMode: IntegrationMode;
  };
  execution: {
    id: string;
    sessionId?: string;
    status?: "running" | "completed" | "error";
    startedAt?: string;
    endedAt?: string;
    metadata?: Record<string, unknown>;
  };
  span: {
    id: string;
    parentId?: string;
    node: string;
    kind: NodeKind;
    provider?: string;
    model?: string;
    startedAt: string;
    endedAt: string;
    status: "ok" | "error";
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
    costCents?: number;
    input?: unknown;
    output?: unknown;
    error?: string;
    metadata?: Record<string, unknown>;
    requirements?: NodeRequirements;
  };
  captureMode: CaptureMode;
}

interface QueuedSpan {
  span: WireSpan;
  attempts: number;
}

const MAX_BATCH_BYTES = 900_000;
const MAX_QUEUE_SIZE = 1_000;

function id(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function endpoint(baseUrl: string): string {
  const clean = baseUrl.replace(/\/+$/, "");
  if (clean.endsWith("/v1")) return `${clean}/ingest/spans`;
  return `${clean}/v1/ingest/spans`;
}

function apiEndpoint(baseUrl: string, path: string): string {
  const clean = baseUrl.replace(/\/+$/, "");
  const root = clean.endsWith("/v1") ? clean : `${clean}/v1`;
  return `${root}${path}`;
}

function envCapture(value: string | undefined): CaptureMode {
  return value === "inputs" || value === "full" ? value : "metadata";
}

export class Blindspot {
  readonly enabled: boolean;
  private readonly config: Required<
    Pick<
      BlindspotConfig,
      "workflow" | "environment" | "captureMode" | "integrationMode" | "flushIntervalMs"
    >
  > &
    Omit<
      BlindspotConfig,
      "workflow" | "environment" | "captureMode" | "integrationMode" | "flushIntervalMs"
    >;
  private queue: QueuedSpan[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sending: Promise<void> | null = null;

  constructor(config: BlindspotConfig) {
    this.config = {
      ...config,
      environment: config.environment ?? "production",
      captureMode: config.captureMode ?? "metadata",
      integrationMode: config.integrationMode ?? "observe_only",
      flushIntervalMs: config.flushIntervalMs ?? 100,
    };
    this.enabled = Boolean(config.apiKey && config.baseUrl);
    if (!this.enabled) {
      queueMicrotask(() =>
        this.report(
          new Error(
            "Blindspot telemetry disabled: BLINDSPOT_API_KEY and BLINDSPOT_BASE_URL are required",
          ),
        ),
      );
    }
  }

  /** Environment-variable setup keeps adoption to one initialization line. */
  static fromEnv(options: Pick<BlindspotConfig, "workflow" | "framework" | "language" | "onError">) {
    return new Blindspot({
      ...options,
      apiKey: process.env.BLINDSPOT_API_KEY,
      baseUrl: process.env.BLINDSPOT_BASE_URL,
      environment: process.env.BLINDSPOT_ENVIRONMENT ?? process.env.NODE_ENV ?? "production",
      captureMode: envCapture(process.env.BLINDSPOT_CAPTURE),
      integrationMode: process.env.BLINDSPOT_ROUTING === "managed" ? "managed" : "observe_only",
    });
  }

  /** Start a timed observation and end it after the underlying operation finishes. */
  span(start: SpanStart) {
    const startedAt = start.startedAt ?? new Date();
    const spanId = start.id ?? id();
    return {
      id: spanId,
      end: (end: SpanEnd = {}) => {
        const endedAt = end.endedAt ?? new Date();
        const mode = this.config.captureMode;
        const wire: WireSpan = {
          workflow: {
            name: this.config.workflow,
            framework: this.config.framework,
            language: this.config.language,
            environment: this.config.environment,
            integrationMode: this.config.integrationMode,
          },
          execution: {
            id: start.executionId,
            sessionId: start.sessionId,
            // Child spans do not own the workflow lifecycle. Omitting status prevents a late
            // best-effort node (for example, post-answer memory extraction) from reopening an
            // execution that the real request boundary already marked completed.
            status: end.executionStatus,
            startedAt: start.executionStartedAt?.toISOString(),
            endedAt: end.executionEndedAt?.toISOString(),
            metadata: start.executionMetadata,
          },
          span: {
            id: spanId,
            parentId: start.parentId,
            node: start.node,
            kind: start.kind ?? "generation",
            provider: start.provider,
            model: start.model,
            startedAt: startedAt.toISOString(),
            endedAt: endedAt.toISOString(),
            status: end.status ?? "ok",
            latencyMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
            inputTokens: end.inputTokens,
            outputTokens: end.outputTokens,
            costCents: end.costCents,
            input: mode === "inputs" || mode === "full" ? start.input : undefined,
            output: mode === "full" ? end.output : undefined,
            error: end.error,
            metadata: { ...start.metadata, ...end.metadata },
            requirements: start.requirements,
          },
          captureMode: mode,
        };
        this.enqueue(wire);
      },
    };
  }

  /** Convenience wrapper for existing model-call helpers such as gstpilot's recordGeneration. */
  async observeGeneration<T>(
    start: Omit<SpanStart, "kind">,
    operation: () => Promise<T>,
    extract?: (result: T) => Omit<SpanEnd, "status" | "error">,
  ): Promise<T> {
    const span = this.span({ ...start, kind: "generation" });
    try {
      const result = await operation();
      span.end({ status: "ok", ...extract?.(result) });
      return result;
    } catch (error) {
      span.end({ status: "error", error: error instanceof Error ? error.message : "unknown error" });
      throw error;
    }
  }

  /**
   * Resolve a node's approved model only when BLINDSPOT_ROUTING=managed. Observe-only apps keep
   * their fallback and approvals remain "awaiting rollout" instead of pretending to be applied.
   */
  async resolveModel(node: string, fallbackModel: string): Promise<string> {
    if (!this.enabled || this.config.integrationMode !== "managed") return fallbackModel;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    timeout.unref?.();
    try {
      const response = await fetch(apiEndpoint(this.config.baseUrl!, "/workflows/resolve-model"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workflow: this.config.workflow,
          environment: this.config.environment,
          node,
          fallbackModel,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Blindspot model resolution returned ${response.status}`);
      const body = (await response.json()) as { modelRef?: string };
      if (!body.modelRef) throw new Error("Blindspot model resolution returned no model");
      return body.modelRef;
    } catch (error) {
      this.report(
        error instanceof Error ? error : new Error("Blindspot model resolution failed"),
      );
      return fallbackModel;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Explicit, revocable application action; Blindspot never reads repository files itself. */
  async shareContext(manifest: WorkflowContextManifest): Promise<boolean> {
    if (!this.enabled) return false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    timeout.unref?.();
    try {
      const response = await fetch(apiEndpoint(this.config.baseUrl!, "/workflow-context"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workflow: {
            name: this.config.workflow,
            environment: this.config.environment,
          },
          consent: true,
          manifest,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Blindspot context sharing returned ${response.status}`);
      return true;
    } catch (error) {
      this.report(error instanceof Error ? error : new Error("Blindspot context sharing failed"));
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Send queued observations now; call this before a short-lived process exits. */
  async flush(): Promise<void> {
    if (!this.enabled || this.queue.length === 0) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.sending) await this.sending;
    this.sending = this.sendQueued();
    try {
      await this.sending;
    } finally {
      this.sending = null;
      if (this.queue.length > 0) await this.flush();
    }
  }

  private enqueue(span: WireSpan) {
    if (!this.enabled) return;
    // Protect the host app from unbounded memory if telemetry delivery is unavailable.
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.queue.shift();
      this.report(new Error("Blindspot telemetry queue full; oldest span dropped"));
    }
    let safeSpan = span;
    if (this.encodedBytes(span) > MAX_BATCH_BYTES) {
      // Preserve operational evidence instead of sending a body the server must reject. Content
      // is omitted explicitly and the host receives a warning; the model call still succeeds.
      safeSpan = {
        ...span,
        execution: { ...span.execution, metadata: undefined },
        span: {
          ...span.span,
          input: undefined,
          output: undefined,
          metadata: { blindspotPayloadOmitted: "span exceeded 900 KB" },
        },
        captureMode: "metadata",
      };
      this.report(new Error("Blindspot span exceeded 900 KB; stored metadata without content"));
    }
    this.queue.push({ span: safeSpan, attempts: 0 });
    if (this.queue.length >= 100) {
      void this.flush();
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), this.config.flushIntervalMs);
      this.timer.unref?.();
    }
  }

  private async sendQueued() {
    const batch: QueuedSpan[] = [];
    let bytes = 12; // {"spans":[]}
    while (batch.length < 100 && this.queue.length > 0) {
      const next = this.queue[0]!;
      const nextBytes = this.encodedBytes(next.span) + (batch.length > 0 ? 1 : 0);
      if (batch.length > 0 && bytes + nextBytes > MAX_BATCH_BYTES) break;
      batch.push(this.queue.shift()!);
      bytes += nextBytes;
    }
    if (batch.length === 0) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    timeout.unref?.();
    try {
      const response = await fetch(endpoint(this.config.baseUrl!), {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ spans: batch.map((item) => item.span) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Blindspot ingest returned ${response.status}`);
    } catch (error) {
      const retryable = batch
        .filter((item) => item.attempts < 1)
        .map((item) => ({ ...item, attempts: item.attempts + 1 }));
      if (retryable.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        this.queue.unshift(...retryable);
      }
      this.report(
        error instanceof Error ? error : new Error("Blindspot telemetry delivery failed"),
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private encodedBytes(value: unknown): number {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  }

  private report(error: Error) {
    if (this.config.onError) this.config.onError(error);
    else console.warn(`[Blindspot] ${error.message}`);
  }
}
