"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Empty, LabelBadge, OriginBadge } from "@/components/ui";
import { relTime } from "@/lib/format";
import type { GoldenExample, GoldenSet, Trace } from "@/lib/types";
import { addEx, delEx, editEx, promote, seedGenerate, seedUpload } from "./actions";

export function GoldenManager({
  route,
  sets,
  selectedId,
  examples,
  traces,
}: {
  route: string;
  sets: GoldenSet[];
  selectedId: string | null;
  examples: GoldenExample[];
  traces: Trace[];
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
        <SeedPanel route={route} pending={pending} run={run} empty />
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
                    <th>Input</th>
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
                          {ex.input.length > 140 ? ex.input.slice(0, 140) + "…" : ex.input}
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

          <div className="grid cols-2" style={{ marginTop: 14 }}>
            <SeedPanel route={route} pending={pending} run={run} />
            <PromoteTracePanel route={route} setId={selectedId} traces={traces} pending={pending} run={run} />
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
  empty,
}: {
  route: string;
  pending: boolean;
  run: Run;
  empty?: boolean;
}) {
  const [task, setTask] = useState("");
  const [productBrief, setProductBrief] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [architecture, setArchitecture] = useState("");
  const [useLiveTraces, setUseLiveTraces] = useState(false);
  const [count, setCount] = useState(20);
  const [format, setFormat] = useState<"csv" | "jsonl">("jsonl");
  const [data, setData] = useState("");

  return (
    <div className="card">
      {empty ? (
        <Empty emoji="✷" title="No golden set yet">
          <p className="muted small" style={{ marginBottom: 4 }}>
            Upload a golden set (CSV/JSONL) or let Blindspot write one from the task.
          </p>
        </Empty>
      ) : (
        <div className="card-title" style={{ marginBottom: 12 }}>
          Add examples / new version
        </div>
      )}

      <div className="field">
        <label className="label">Generate with the Golden Set Agent</label>
        <textarea
          className="textarea"
          style={{ minHeight: 54, fontFamily: "var(--sans)" }}
          placeholder="Task description, e.g. “Summarize a support ticket into one sentence.”"
          value={task}
          onChange={(e) => setTask(e.target.value)}
        />
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontWeight: 550 }}>
            Add product context, prompts or architecture
          </summary>
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            <textarea
              className="textarea"
              style={{ minHeight: 70 }}
              placeholder="Product brief / README / design notes"
              value={productBrief}
              onChange={(event) => setProductBrief(event.target.value)}
            />
            <textarea
              className="textarea mono"
              style={{ minHeight: 70 }}
              placeholder="System prompt"
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
            />
            <textarea
              className="textarea"
              style={{ minHeight: 70 }}
              placeholder="Agentic architecture / node responsibilities"
              value={architecture}
              onChange={(event) => setArchitecture(event.target.value)}
            />
            <label className="row small" style={{ gap: 7, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={useLiveTraces}
                onChange={(event) => setUseLiveTraces(event.target.checked)}
              />
              I approve using retained inputs from up to 20 recent live traces as examples
            </label>
            <div className="hint">
              Live data is never used unless this box is selected; project capture controls still
              determine what Blindspot retained.
            </div>
          </div>
        </details>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <input
            className="input"
            type="number"
            min={1}
            max={50}
            style={{ width: 90 }}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
          <button
            className="btn primary"
            disabled={pending}
            onClick={() =>
              run(() =>
                seedGenerate(route, task, count, {
                  productBrief,
                  systemPrompt,
                  architecture,
                  useLiveTraces,
                }),
              )
            }
          >
            {pending ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>

      <div className="divider" />

      <div className="field" style={{ marginBottom: 0 }}>
        <label className="label">Upload CSV / JSONL</label>
        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
          <select className="select" style={{ width: 110 }} value={format} onChange={(e) => setFormat(e.target.value as "csv" | "jsonl")}>
            <option value="jsonl">JSONL</option>
            <option value="csv">CSV</option>
          </select>
          <span className="hint" style={{ marginTop: 0 }}>
            columns: input, reference_output, rubric, label
          </span>
        </div>
        <textarea
          className="textarea"
          placeholder={
            format === "jsonl"
              ? '{"input":"Summarize: ...","reference_output":"...","rubric":"..."}'
              : "input,reference_output,rubric\nSummarize: ...,...,..."
          }
          value={data}
          onChange={(e) => setData(e.target.value)}
        />
        <button
          className="btn"
          style={{ marginTop: 8 }}
          disabled={pending || !data.trim()}
          onClick={() => run(() => seedUpload(route, format, data), () => setData(""))}
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>
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
