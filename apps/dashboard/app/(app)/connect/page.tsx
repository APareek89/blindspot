import { Copy } from "@/components/Copy";
import { GATEWAY_URL } from "@/lib/api";
import { PageError } from "@/components/PageError";
import { requireApi } from "@/lib/session";
import { dateTime } from "@/lib/format";
import type { CaptureMode } from "@/lib/types";
import { setCaptureMode } from "./actions";

export const dynamic = "force-dynamic";

const BASE = `${GATEWAY_URL}/v1`;
const SDK_URL = "https://blindspot-dashboard.onrender.com/blindspot-sdk-0.1.0.tgz";
const INSTALL = `pnpm add ${SDK_URL}`;

const CURL = `curl ${BASE}/chat/completions \\
  -H "Authorization: Bearer $BLINDSPOT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "route:summarizer",
    "messages": [{"role": "user", "content": "Summarize: ..."}]
  }'`;

const PY = `from openai import OpenAI

client = OpenAI(
    base_url="${BASE}",
    api_key="bs_live_…",          # your Blindspot project key
)

resp = client.chat.completions.create(
    model="route:summarizer",     # a call-site alias, not a model
    messages=[{"role": "user", "content": "Summarize: ..."}],
)`;

const JS = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${BASE}",
  apiKey: process.env.BLINDSPOT_API_KEY, // your Blindspot project key
});

const resp = await client.chat.completions.create({
  model: "route:section-writer",       // one alias per call-site
  messages: [{ role: "user", content: "Write the intro..." }],
});`;

const SDK = `import { Blindspot } from "@blindspot/sdk";

const blindspot = Blindspot.fromEnv({
  workflow: "my-agent",
  framework: "custom",          // e.g. langgraph, vercel-ai, custom
  language: "typescript",
});

const result = await blindspot.observeGeneration(
  {
    executionId: traceId,
    node: "answer-writer",
    model: "claude-sonnet-4-6",
    input: messages,
    requirements: { toolCalling: true, systemMessages: true },
  },
  () => anthropic.messages.create(request),
  (r) => ({
    output: r.content,
    inputTokens: r.usage.input_tokens,
    outputTokens: r.usage.output_tokens,
    executionStatus: "completed",    // only on the final node/request boundary
    executionEndedAt: new Date(),
  }),
);

await blindspot.flush();           // request/process boundary`;

const ENV = `BLINDSPOT_API_KEY=bs_live_…
BLINDSPOT_BASE_URL=${GATEWAY_URL}
BLINDSPOT_ENVIRONMENT=production
BLINDSPOT_CAPTURE=metadata         # metadata | inputs | full
BLINDSPOT_ROUTING=observe_only     # observe_only | managed`;

const MANAGED = `// Native-provider apps explicitly ask Blindspot for the approved model.
// Keep observe_only until every wrapped call uses this resolver.
const modelRef = await blindspot.resolveModel(
  "answer-writer",
  "anthropic:claude-sonnet-4-6",
);
const [provider, model] = modelRef.split(":", 2);
if (provider !== "anthropic") throw new Error("This call site supports Anthropic only");

const response = await anthropic.messages.create({ ...request, model });`;

const CONTEXT = `// Call only after the app owner explicitly approves what is shared.
await blindspot.shareContext({
  version: process.env.APP_VERSION ?? "v1",
  productBrief: "What the product does and who it serves",
  architecture: "router -> retrieval -> answer -> verification",
  documents: [
    { name: "answer prompt", kind: "prompt", content: ANSWER_SYSTEM_PROMPT },
  ],
});`;

const REPLAY = `POST /api/blindspot/replay
Authorization: Bearer $BLINDSPOT_REPLAY_SECRET

Request:  { workflow, route, node, modelRef, input }
Response: {
  output: string,
  promptTokens: number,
  completionTokens: number,
  latencyMs: number,
  costCents?: number,
  targetNodeExecuted: true
}

The handler must execute the real node/workflow with a request-scoped model override.
Do not record replay calls as live customer traffic.`;

const CAPTURE: { mode: CaptureMode; title: string; body: string; retained: string }[] = [
  {
    mode: "metadata",
    title: "Metadata only",
    body: "Safest default. No prompts or outputs are retained.",
    retained: "Model, node, tokens, cost, latency, errors, tools and capability requirements",
  },
  {
    mode: "inputs",
    title: "Inputs",
    body: "Useful for dataset suggestions while keeping model responses private.",
    retained: "Everything above plus prompts and model inputs",
  },
  {
    mode: "full",
    title: "Inputs + outputs",
    body: "Required for the richest debugging and promote-a-trace workflow.",
    retained: "Everything above plus model responses; credential-shaped fields are redacted",
  },
];

const STEPS = [
  {
    n: 1,
    title: "Routes appear",
    body: "The Workflow Map shows all observed node kinds. Routes & Models lists only generation nodes where a model can change.",
  },
  {
    n: 2,
    title: "Give a route a golden set",
    body: "Upload CSV/JSON/JSONL, use approved documents/app context, or explicitly opt into retained live inputs.",
  },
  {
    n: 3,
    title: "Estimate, confirm, then evaluate",
    body: "Use model-only screening to shortlist. Use actual workflow replay for switch-grade evidence, after reviewing the exact cost and sample.",
  },
  {
    n: 4,
    title: "You approve — never a silent switch",
    body: "Managed routing applies an approved model. Observe-only approval is marked awaiting rollout until the app is observed using it.",
  },
];

const ONBOARDING = [
  {
    n: 1,
    title: "Create a separate app key",
    body: "Keep the invite key as recovery. In Settings, mint a second key for the application so it can be revoked independently.",
  },
  {
    n: 2,
    title: "Install and start private",
    body: "Install the TypeScript SDK, add server-only environment variables, and begin with metadata + observe-only.",
  },
  {
    n: 3,
    title: "Wrap one shared model boundary",
    body: "Instrument the helper every model call already passes through. Environment variables alone do not send telemetry.",
  },
  {
    n: 4,
    title: "Send one real request",
    body: "Return here after a request. A production workflow and its latest-seen time will confirm the connection.",
  },
];

const SIGNUP_ONBOARDING = [
  {
    n: 1,
    title: "Add the copied environment",
    body: "Paste the application environment from signup into your hosted app. Keep the recovery key out of the app.",
  },
  {
    n: 2,
    title: "Install the TypeScript SDK",
    body: "Use the pinned beta package below. Start with metadata + observe-only; signup enabled no content retention or routing changes.",
  },
  {
    n: 3,
    title: "Wrap one shared model boundary",
    body: "Instrument the helper every model call already passes through. Environment variables alone do not send telemetry.",
  },
  {
    n: 4,
    title: "Send one safe test request",
    body: "Use no customer data for the first request, then reload this page until the workflow and latest-seen time appear.",
  },
];

function CodeCard({ title, code }: { title: string; code: string }) {
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 12 }}>
        <span className="card-title">{title}</span>
        <Copy text={code} />
      </div>
      <pre className="code">{code}</pre>
    </div>
  );
}

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const welcome = (await searchParams).welcome === "1";
  const client = await requireApi();
  let captureMode: CaptureMode;
  let workflows;
  try {
    const [controls, discovered] = await Promise.all([
      client.getDataControls(),
      client.listWorkflows(),
    ]);
    captureMode = controls.captureMode;
    workflows = discovered.workflows;
  } catch (error) {
    return <PageError error={error} />;
  }
  const production = workflows
    .filter((workflow) => workflow.environment === "production")
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
  const latest = production[0] ?? workflows[0];
  const connectionIsFresh = latest
    ? Date.now() - Date.parse(latest.lastSeenAt) <= 15 * 60 * 1000
    : false;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Connect</h1>
          <p>
            Use the SDK to discover an existing agent workflow without changing its model routing,
            or use the gateway when you want Blindspot to control an approved route.
          </p>
        </div>
      </div>

      {welcome && (
        <div className="alert info" style={{ marginBottom: 14 }}>
          <strong>Workspace created and signed in.</strong> Your app key is separate from the recovery
          key. Complete the four steps below; Blindspot will confirm only after it receives a real trace.
        </div>
      )}

      <div className={`alert ${connectionIsFresh ? "success" : "warn"}`} style={{ marginBottom: 14 }}>
        {connectionIsFresh && latest ? (
          <>
            <strong>Connected:</strong> <span className="mono">{latest.name}</span> · {latest.environment} · {latest.nodeCount} nodes · last seen {dateTime(latest.lastSeenAt)}
          </>
        ) : latest ? (
          <>
            <strong>Workflow found, but no recent request.</strong> <span className="mono">{latest.name}</span> was last seen {dateTime(latest.lastSeenAt)}. Send a request through the connected app, then reload this page.
          </>
        ) : (
          <>
            <strong>Waiting for the first request.</strong> Complete the four steps below, send one request through your app, then reload this page.
          </>
        )}
      </div>

      <h2 style={{ margin: "26px 0 14px", fontSize: 16 }}>Five-minute beta setup</h2>
      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        {(welcome ? SIGNUP_ONBOARDING : ONBOARDING).map((step) => (
          <div className="card" key={step.n}>
            <div className="row" style={{ gap: 10, marginBottom: 8 }}>
              <span className="badge accent">{step.n}</span>
              <span className="card-title">{step.title}</span>
            </div>
            <p className="muted small">{step.body}</p>
          </div>
        ))}
      </div>

      <CodeCard title="Install the TypeScript SDK (beta 0.1.0)" code={INSTALL} />

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row between wrap" style={{ gap: 10 }}>
          <div>
            <div className="card-title">Gateway base URL</div>
            <div className="mono" style={{ marginTop: 6, fontSize: 14 }}>
              {BASE}
            </div>
          </div>
          <Copy text={BASE} label="Copy URL" />
        </div>
      </div>

      <h2 style={{ margin: "26px 0 6px", fontSize: 16 }}>Observe an existing agent</h2>
      <p className="muted small" style={{ marginBottom: 14 }}>
        Environment variables configure the project; one SDK wrapper sends the actual telemetry.
        After one request, choose the discovered flow under Workflows.
      </p>
      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <CodeCard title="Environment" code={ENV} />
        <CodeCard title="TypeScript SDK" code={SDK} />
      </div>

      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <CodeCard title="Optional managed model resolution" code={MANAGED} />
        <CodeCard title="Optional consented app context" code={CONTEXT} />
      </div>

      <CodeCard title="Workflow replay callback contract" code={REPLAY} />

      <h2 style={{ margin: "26px 0 6px", fontSize: 16 }}>Data controls</h2>
      <p className="muted small" style={{ marginBottom: 14 }}>
        The project setting below is the maximum Blindspot may retain. The SDK can be stricter;
        the server always applies the more private of the two choices. This controls storage;
        set <span className="mono">BLINDSPOT_CAPTURE=metadata</span> in the agent app to prevent
        prompt/output content from being transmitted at all.
      </p>
      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        {CAPTURE.map((choice) => {
          const active = captureMode === choice.mode;
          const action = setCaptureMode.bind(null, choice.mode);
          return (
            <form action={action} className="card" key={choice.mode} style={{ borderColor: active ? "var(--accent)" : undefined }}>
              <div className="row between" style={{ marginBottom: 8 }}>
                <span className="card-title">{choice.title}</span>
                {active && <span className="badge pass">Active</span>}
              </div>
              <p className="muted small" style={{ minHeight: 38 }}>{choice.body}</p>
              <div className="hint" style={{ minHeight: 50 }}>{choice.retained}</div>
              <button className={`btn sm ${active ? "" : "primary"}`} disabled={active} style={{ marginTop: 12 }}>
                {active ? "Selected" : "Use this mode"}
              </button>
            </form>
          );
        })}
      </div>

      <h2 style={{ margin: "26px 0 14px", fontSize: 16 }}>Route through Blindspot</h2>

      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <CodeCard title="Python (OpenAI SDK)" code={PY} />
        <CodeCard title="JavaScript / TypeScript" code={JS} />
      </div>

      <CodeCard title="curl" code={CURL} />

      <h2 style={{ margin: "26px 0 14px", fontSize: 16 }}>What happens after you connect</h2>
      <div className="grid cols-2">
        {STEPS.map((s) => (
          <div key={s.n} className="card">
            <div className="row" style={{ gap: 10, marginBottom: 8 }}>
              <span className="badge accent">{s.n}</span>
              <span className="card-title">{s.title}</span>
            </div>
            <p className="muted small">{s.body}</p>
          </div>
        ))}
      </div>
    </>
  );
}
