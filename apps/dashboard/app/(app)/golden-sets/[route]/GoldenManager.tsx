"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Empty, LabelBadge, OriginBadge } from "@/components/ui";
import { relTime } from "@/lib/format";
import type { GoldenExample, GoldenSet, RouteWorkflowContext, Trace } from "@/lib/types";
import { addEx, delEx, editEx, promote, seedGenerate, seedUpload } from "./actions";

function visibleInput(input: string): string {
  const marker = input.toLowerCase().lastIndexOf("question:");
  return marker >= 0 ? input.slice(marker + "question:".length).trim() : input;
}

export function GoldenManager({
  route,
  sets,
  selectedId,
  examples,
  traces,
  workflowContext,
}: {
  route: string;
  sets: GoldenSet[];
  selectedId: string | null;
  examples: GoldenExample[];
  traces: Trace[];
  workflowContext: RouteWorkflowContext | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<GoldenExample | null>(null);
  const selected = sets.find((s) => s.id === selectedId) ?? null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "failed");
      else done?.();
    });
  };

  return (
    <>
      {/* version tabs */}
      {sets.length > 0 && (
        <div className="row between" style={{ marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {sets.map((s) => (
              <Link
                key={s.id}
                href={`/golden-sets/${encodeURIComponent(route)}?v=${s.version}`}
                className={`badge ${s.id === selectedId ? "accent" : "neutral"}`}
                style={{ padding: "5px 12px", cursor: "pointer" }}
              >
                v{s.version}
              </Link>
            ))}
          </div>
          {selected && (
            <div className="row" style={{ gap: 8 }}>
              <OriginBadge origin={selected.origin} />
              <span className="muted small">
                {examples.length} example{examples.length === 1 ? "" : "s"} · created {relTime(selected.createdAt)}
              </span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="alert danger" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}

      {sets.length === 0 ? (
        <SeedPanel
          route={route}
          pending={pending}
          run={run}
          workflowContext={workflowContext}
          empty
        />
      ) : (
        <>
          <div className="card pad-0" style={{ marginBottom: 14 }}>
            {examples.length === 0 ? (
              <Empty emoji="✎" title="This version has no examples">
                <p className="muted small">Add one below, or generate a new version.</p>
              </Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>User / task input</th>
                    <th>Reference output</th>
                    <th style={{ width: 120 }}>Label</th>
                    <th style={{ width: 70 }}>Active</th>
                    <th style={{ width: 120 }} />
                  </tr>
                </thead>
                <tbody>
                  {examples.map((ex) => (
                    <tr key={ex.id}>
                      <td style={{ maxWidth: 280 }}>
                        <div className="mono small" style={{ whiteSpace: "normal" }}>
                          {visibleInput(ex.input).length > 140
                            ? visibleInput(ex.input).slice(0, 140) + "…"
                            : visibleInput(ex.input)}
                        </div>
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        <div className="muted small" style={{ whiteSpace: "normal" }}>
                          {ex.referenceOutput
                            ? ex.referenceOutput.slice(0, 100) + (ex.referenceOutput.length > 100 ? "…" : "")
                            : "—"}
                        </div>
                      </td>
                      <td>
                        <select
                          className="select"
                          value={ex.label}
                          disabled={pending}
                          onChange={(e) => run(() => editEx(route, ex.id, { label: e.target.value }))}
                        >
                          <option value="unlabeled">unlabeled</option>
                          <option value="pass">pass</option>
                          <option value="fail">fail</option>
                        </select>
                      </td>
                      <td>
                        <button
                          className={`toggle ${ex.active ? "on" : ""}`}
                          disabled={pending}
                          onClick={() => run(() => editEx(route, ex.id, { active: !ex.active }))}
                          aria-label="toggle active"
                        />
                      </td>
                      <td className="num">
                        <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                          <button className="btn sm" onClick={() => setEditing(ex)}>
                            Edit
                          </button>
                          <button
                            className="btn sm danger-ghost"
                            disabled={pending}
                            onClick={() => run(() => delEx(route, ex.id))}
                          >
                            Del
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {selectedId && <AddExampleForm route={route} setId={selectedId} pending={pending} run={run} />}

          <div style={{ marginTop: 14 }}>
            <SeedPanel
              route={route}
              pending={pending}
              run={run}
              workflowContext={workflowContext}
            />
          </div>
          <div style={{ marginTop: 14 }}>
            <PromoteTracePanel
              route={route}
              setId={selectedId}
              traces={traces}
              pending={pending}
              run={run}
            />
          </div>
        </>
      )}

      {editing && (
        <EditDrawer
          ex={editing}
          route={route}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(patch) => run(() => editEx(route, editing.id, patch), () => setEditing(null))}
        />
      )}
    </>
  );
}

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) => void;

function SeedPanel({
  route,
  pending,
  run,
  workflowContext,
  empty,
}: {
  route: string;
  pending: boolean;
  run: Run;
  workflowContext: RouteWorkflowContext | null;
  empty?: boolean;
}) {
  type Source = "upload" | "agent" | "connected" | "live";
  type Format = "csv" | "json" | "jsonl";
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<Source | null>(null);
  const [task, setTask] = useState("");
  const [productBrief, setProductBrief] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [architecture, setArchitecture] = useState("");
  const [useLiveTraces, setUseLiveTraces] = useState(false);
  const [count, setCount] = useState(20);
  const [format, setFormat] = useState<Format>("jsonl");
  const [data, setData] = useState("");
  const [fileName, setFileName] = useState("");
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const connected = workflowContext?.context ?? null;
  const connectedContext = () => {
    if (!connected) return { productBrief: "", systemPrompt: "", architecture: "" };
    const promptDocuments = connected.documents.filter((document) => document.kind === "prompt");
    const supportingDocuments = connected.documents.filter((document) => document.kind !== "prompt");
    return {
      productBrief: [
        connected.productBrief,
        ...supportingDocuments.map((document) => `# ${document.name}\n${document.content}`),
      ]
        .filter(Boolean)
        .join("\n\n"),
      systemPrompt: promptDocuments
        .map((document) => `# ${document.name}\n${document.content}`)
        .join("\n\n"),
      architecture: connected.architecture ?? "",
    };
  };

  const chooseSource = (next: Source) => {
    setSource(next);
    setConsent(false);
    setFileError(null);
    setStep(2);
    if (next === "connected" && connected) {
      const context = connectedContext();
      setProductBrief(context.productBrief);
      setSystemPrompt(context.systemPrompt);
      setArchitecture(context.architecture);
    }
    if (next === "live") setUseLiveTraces(true);
  };

  const readDataset = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5_000_000) {
      setData("");
      setFileName("");
      setFileError("Dataset is larger than the 5 MB upload limit.");
      return;
    }
    setFileError(null);
    const extension = file.name.split(".").pop()?.toLowerCase();
    const nextFormat: Format = extension === "csv" ? "csv" : extension === "json" ? "json" : "jsonl";
    setFormat(nextFormat);
    setFileName(file.name);
    setData(await file.text());
  };

  const readContextDocuments = async (files: FileList | null) => {
    if (!files) return;
    setFileError(null);
    const selected = [...files].slice(0, 10);
    const contents = await Promise.all(
      selected.map(async (file) => `# ${file.name}\n${await file.slice(0, 50_000).text()}`),
    );
    setContextFiles(selected.map((file) => file.name));
    setProductBrief(contents.join("\n\n").slice(0, 50_000));
    setConsent(false);
  };

  const readyForReview =
    source === "upload" ? Boolean(data.trim()) : Boolean(task.trim() || productBrief.trim());
  const needsConsent = source === "connected" || source === "live" || contextFiles.length > 0;

  const publish = () => {
    if (source === "upload") {
      run(() => seedUpload(route, format, data), () => {
        setData("");
        setFileName("");
        setStep(4);
      });
      return;
    }
    run(
      () =>
        seedGenerate(route, task, count, {
          productBrief,
          systemPrompt,
          architecture,
          useLiveTraces: source === "live" && useLiveTraces,
        }),
      () => setStep(4),
    );
  };

  return (
    <div className="card">
      {empty ? (
        <Empty emoji="✷" title="No golden set yet">
          <p className="muted small" style={{ marginBottom: 4 }}>
            Build it in four explicit steps. Nothing from your app or live users is used without
            your approval.
          </p>
        </Empty>
      ) : (
        <div className="card-title" style={{ marginBottom: 12 }}>
          Create a new golden-set version
        </div>
      )}

      <div className="row wrap" style={{ gap: 6, margin: "12px 0 18px" }}>
        {["Choose source", "Configure", "Review & publish", "Run experiment"].map((label, index) => (
          <span className={`badge ${step === index + 1 ? "accent" : step > index + 1 ? "pass" : "neutral"}`} key={label}>
            {index + 1}. {label}
          </span>
        ))}
      </div>

      {step === 1 && (
        <div className="grid cols-2">
          <button className="card" style={{ textAlign: "left" }} onClick={() => chooseSource("upload")}>
            <div className="card-title">Upload a dataset</div>
            <div className="card-sub">CSV, JSON or JSONL with input, expected output, rubric and label.</div>
          </button>
          <button className="card" style={{ textAlign: "left" }} onClick={() => chooseSource("agent")}>
            <div className="card-title">Generate from documents</div>
            <div className="card-sub">Use a task, README, design.md, prompt or architecture file as context.</div>
          </button>
          <button className="card" style={{ textAlign: "left", opacity: connected ? 1 : 0.55 }} disabled={!connected} onClick={() => chooseSource("connected")}>
            <div className="card-title">Use connected-app context</div>
            <div className="card-sub">
              {connected ? `${workflowContext?.workflowName} shared manifest ${connected.version}.` : "The connected app has not explicitly shared a context manifest."}
            </div>
          </button>
          <button className="card" style={{ textAlign: "left" }} onClick={() => chooseSource("live")}>
            <div className="card-title">Draft from live traces</div>
            <div className="card-sub">Use retained production inputs only after a separate consent step.</div>
          </button>
        </div>
      )}

      {step === 2 && source === "upload" && (
        <div className="stack" style={{ gap: 10 }}>
          <div>
            <label className="label">Golden-set file</label>
            <input className="input" type="file" accept=".csv,.json,.jsonl,application/json,text/csv" onChange={(event) => void readDataset(event.target.files?.[0])} />
            {fileError && <div className="alert danger" style={{ marginTop: 8 }}>{fileError}</div>}
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <select className="select" value={format} onChange={(event) => setFormat(event.target.value as Format)}>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="jsonl">JSONL</option>
            </select>
            <span className="hint" style={{ marginTop: 0 }}>{fileName || "You can also paste the file contents below."}</span>
          </div>
          <textarea className="textarea mono" value={data} onChange={(event) => setData(event.target.value)} />
        </div>
      )}

      {step === 2 && source !== "upload" && source != null && (
        <div className="stack" style={{ gap: 10 }}>
          <div>
            <label className="label">What should this node do?</label>
            <textarea className="textarea" placeholder="Describe the task and the behavior a good answer must have." value={task} onChange={(event) => setTask(event.target.value)} />
          </div>
          {source === "agent" && (
            <div>
              <label className="label">Product or prompt documents (.md or .txt)</label>
              <input className="input" type="file" multiple accept=".md,.txt,text/markdown,text/plain" onChange={(event) => void readContextDocuments(event.target.files)} />
              <div className="hint">{contextFiles.join(", ") || "No document selected."}</div>
              {fileError && <div className="alert danger" style={{ marginTop: 8 }}>{fileError}</div>}
            </div>
          )}
          {(source === "agent" || source === "connected") && (
            <details open={source === "connected"}>
              <summary style={{ cursor: "pointer", fontWeight: 550 }}>Review shared context</summary>
              <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                <textarea className="textarea" placeholder="Product brief" value={productBrief} onChange={(event) => setProductBrief(event.target.value)} />
                <textarea className="textarea mono" placeholder="System prompt" value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} />
                <textarea className="textarea" placeholder="Architecture" value={architecture} onChange={(event) => setArchitecture(event.target.value)} />
              </div>
            </details>
          )}
          {source === "live" && (
            <div className="alert warn">
              Blindspot will use only inputs already retained under Data Controls, up to 20 recent traces. Metadata-only projects contain no chat text to use.
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <label className="label" style={{ margin: 0 }}>Draft examples</label>
            <input className="input" type="number" min={1} max={50} style={{ width: 90 }} value={count} onChange={(event) => setCount(Number(event.target.value))} />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="row between wrap" style={{ marginTop: 16 }}>
          <button className="btn" onClick={() => setStep(1)}>Back</button>
          <button className="btn primary" disabled={!readyForReview} onClick={() => setStep(3)}>Review before publishing →</button>
        </div>
      )}

      {step === 3 && source && (
        <div>
          <div className="grid cols-3" style={{ marginBottom: 12 }}>
            <div><div className="kpi-label">Source</div><div>{source.replace("_", " ")}</div></div>
            <div><div className="kpi-label">Examples</div><div>{source === "upload" ? "From file" : count}</div></div>
            <div><div className="kpi-label">New version</div><div>Created after success</div></div>
          </div>
          <div className="hint" style={{ whiteSpace: "pre-wrap" }}>
            {source === "upload"
              ? `${fileName || "Pasted data"} · ${data.length.toLocaleString()} characters · ${format.toUpperCase()}`
              : `${task || "Task inferred from shared context"}\n${productBrief ? "Product context included. " : ""}${systemPrompt ? "System prompt included. " : ""}${architecture ? "Architecture included." : ""}`}
          </div>
          {source !== "upload" && (
            <div className="alert info" style={{ marginTop: 10 }}>
              Generating examples calls the configured Golden Set model. Provider usage begins only when you click Publish.
            </div>
          )}
          {needsConsent && (
            <label className="row small" style={{ gap: 8, cursor: "pointer", marginTop: 12 }}>
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              I approve sharing the selected {source === "live" ? "retained live inputs" : "app documents/context"} with the Golden Set Agent for this version.
            </label>
          )}
          <div className="row between wrap" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => setStep(2)}>Back</button>
            <button className="btn primary" disabled={pending || (needsConsent && !consent)} onClick={publish}>
              {pending ? "Publishing…" : source === "upload" ? "Validate & publish" : "Generate & publish"}
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="alert info">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Golden set published.</div>
          <div>Review and edit its examples above, then continue to a budgeted model experiment.</div>
          <Link href={`/routes/${encodeURIComponent(route)}`} className="btn-link">Open experiment →</Link>
        </div>
      )}
    </div>
  );
}

function AddExampleForm({ route, setId, pending, run }: { route: string; setId: string; pending: boolean; run: Run }) {
  const [input, setInput] = useState("");
  const [ref, setRef] = useState("");
  const [rubric, setRubric] = useState("");
  const [label, setLabel] = useState("unlabeled");

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 12 }}>
        Add an example
      </div>
      <div className="field">
        <label className="label">Input (a self-contained task prompt)</label>
        <textarea className="textarea" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Summarize the following in one sentence: ..." />
      </div>
      <div className="grid cols-2">
        <div className="field">
          <label className="label">Reference output (optional)</label>
          <textarea className="textarea" style={{ minHeight: 54 }} value={ref} onChange={(e) => setRef(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Rubric (optional)</label>
          <textarea className="textarea" style={{ minHeight: 54 }} value={rubric} onChange={(e) => setRubric(e.target.value)} />
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <select className="select" style={{ width: 130 }} value={label} onChange={(e) => setLabel(e.target.value)}>
          <option value="unlabeled">unlabeled</option>
          <option value="pass">pass</option>
          <option value="fail">fail</option>
        </select>
        <button
          className="btn primary"
          disabled={pending || !input.trim()}
          onClick={() =>
            run(
              () =>
                addEx(route, setId, {
                  input,
                  referenceOutput: ref.trim() || undefined,
                  rubric: rubric.trim() || undefined,
                  label,
                }),
              () => {
                setInput("");
                setRef("");
                setRubric("");
                setLabel("unlabeled");
              },
            )
          }
        >
          Add example
        </button>
      </div>
    </div>
  );
}

function PromoteTracePanel({
  route,
  setId,
  traces,
  pending,
  run,
}: {
  route: string;
  setId: string | null;
  traces: Trace[];
  pending: boolean;
  run: Run;
}) {
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 4 }}>
        Promote a production trace
      </div>
      <div className="card-sub" style={{ marginBottom: 12 }}>
        Turn a real request into a golden example in one click.
      </div>
      {traces.length === 0 ? (
        <p className="muted small">No traces on this route yet.</p>
      ) : (
        <div className="stack" style={{ gap: 0 }}>
          {traces.slice(0, 8).map((t) => {
            const preview =
              Array.isArray(t.input) && t.input.length
                ? String((t.input[t.input.length - 1] as { content?: unknown })?.content ?? "")
                : JSON.stringify(t.input);
            return (
              <div key={t.id} className="row between" style={{ padding: "9px 0", borderBottom: "1px solid var(--border)", gap: 10 }}>
                <div className="mono small" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {preview.slice(0, 60) || "—"}
                </div>
                <button
                  className="btn sm"
                  disabled={pending || !setId}
                  onClick={() => setId && run(() => promote(route, setId, t.id))}
                >
                  Promote
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EditDrawer({
  ex,
  route,
  pending,
  onClose,
  onSave,
}: {
  ex: GoldenExample;
  route: string;
  pending: boolean;
  onClose: () => void;
  onSave: (patch: { input: string; referenceOutput: string | null; rubric: string | null; label: string }) => void;
}) {
  const [input, setInput] = useState(ex.input);
  const [ref, setRef] = useState(ex.referenceOutput ?? "");
  const [rubric, setRubric] = useState(ex.rubric ?? "");
  const [label, setLabel] = useState(ex.label);

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <div className="card-title">Edit example</div>
            <div className="muted small">
              {route} · <LabelBadge label={ex.label} />
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="drawer-body">
          <div className="field">
            <label className="label">Input</label>
            <textarea className="textarea" style={{ minHeight: 110 }} value={input} onChange={(e) => setInput(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Reference output</label>
            <textarea className="textarea" value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Rubric</label>
            <textarea className="textarea" style={{ minHeight: 54 }} value={rubric} onChange={(e) => setRubric(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Label</label>
            <select className="select" value={label} onChange={(e) => setLabel(e.target.value as GoldenExample["label"])}>
              <option value="unlabeled">unlabeled</option>
              <option value="pass">pass</option>
              <option value="fail">fail</option>
            </select>
          </div>
          <button
            className="btn primary"
            disabled={pending || !input.trim()}
            onClick={() =>
              onSave({
                input,
                referenceOutput: ref.trim() ? ref : null,
                rubric: rubric.trim() ? rubric : null,
                label,
              })
            }
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </aside>
    </>
  );
}
