import { Copy } from "@/components/Copy";
import { GATEWAY_URL } from "@/lib/api";
import { PageError } from "@/components/PageError";
import { requireApi } from "@/lib/session";
import type { CaptureMode } from "@/lib/types";
import { setCaptureMode } from "./actions";

export const dynamic = "force-dynamic";

const BASE = `${GATEWAY_URL}/v1`;

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
BLINDSPOT_ENVIRONMENT=development
BLINDSPOT_CAPTURE=metadata         # metadata | inputs | full`;

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
    body: "Every distinct route:<name> you call shows up under Routes & Models with live cost and quality — auto-created on first traffic.",
  },
  {
    n: 2,
    title: "Give a route a golden set",
    body: "Upload a CSV/JSONL, or let the Golden Set Agent write one from the task. This defines “good” for that route.",
  },
  {
    n: 3,
    title: "Estimate, confirm, then evaluate",
    body: "Adding a compatible candidate spends nothing. Choose models and a budget, review the exact full or sampled plan, then explicitly confirm the paid run.",
  },
  {
    n: 4,
    title: "You approve — never a silent switch",
    body: "A complete passing eval creates evidence in Approvals. Approve there to update the live model; rejection or no action leaves it unchanged.",
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

export default async function ConnectPage() {
  const client = await requireApi();
  let captureMode: CaptureMode;
  try {
    captureMode = (await client.getDataControls()).captureMode;
  } catch (error) {
    return <PageError error={error} />;
  }
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
