import { PreparedBadge, PreparedNotice, isPrepared } from "@/components/PreparedNotice";
import Link from "next/link";
import { PageError } from "@/components/PageError";
import { Empty } from "@/components/ui";
import { dateTime, modelName, qualityPct, preparedName } from "@/lib/format";
import { requireApi } from "@/lib/session";
import type { EvalExampleEvidence, EvalRunEvidence } from "@/lib/types";
import { RouteTabs } from "../RouteTabs";

export const dynamic = "force-dynamic";

function criterionMean(example: EvalExampleEvidence): number | null {
  if (example.perCriterionJson.length === 0) return null;
  return (
    example.perCriterionJson.reduce((sum, criterion) => sum + criterion.score, 0) /
    example.perCriterionJson.length
  );
}

function outputPreview(value: string | null, empty: string) {
  if (!value) return <span className="muted">{empty}</span>;
  return (
    <details>
      <summary style={{ cursor: "pointer" }}>{value.slice(0, 120)}{value.length > 120 ? "…" : ""}</summary>
      <div className="hint" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{value}</div>
    </details>
  );
}

function inputEvidence(value: string) {
  const questionMarker = /(?:^|\n)\s*Question:\s*/gi;
  const matches = [...value.matchAll(questionMarker)];
  const last = matches.at(-1);
  if (!last?.index) {
    return <div className="small" style={{ whiteSpace: "pre-wrap" }}>{value}</div>;
  }

  const questionStart = last.index + last[0].length;
  const promptContext = value.slice(0, last.index).trim();
  const userInput = value.slice(questionStart).trim();
  return (
    <div className="stack" style={{ gap: 7 }}>
      <div className="small" style={{ whiteSpace: "pre-wrap" }}>{userInput}</div>
      {promptContext && (
        <details>
          <summary className="muted small" style={{ cursor: "pointer" }}>Prompt context</summary>
          <div className="hint" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{promptContext}</div>
        </details>
      )}
    </div>
  );
}

function EvidenceTable({ run, qualityBar, prepared }: { run: EvalRunEvidence; qualityBar: number; prepared: boolean }) {
  return (
    <section className="card pad-0" style={{ marginBottom: 14 }}>
      <div className="row between wrap" style={{ padding: "14px 16px", gap: 10 }}>
        <div>
          <div className="row wrap" style={{ gap: 7, marginBottom: 5 }}>
            <span className="model-ref">{modelName(run.modelRef)}</span>{prepared && <span className="badge neutral">Illustrative fixture</span>}
            <span className={`badge ${run.status === "completed" ? "pass" : "warn"}`}>{run.status}</span>
            <span className={`badge ${run.executionMode === "workflow_replay" ? "pass" : "cyan"}`}>
              {run.executionMode === "workflow_replay" ? "Actual workflow replay" : "Model-only screening"}
            </span>
          </div>
          <div className="muted small">
            {dateTime(run.createdAt)} · golden v{run.goldenSetVersion} · {run.examplesScored}/{run.examplesPlanned} scored
          </div>
        </div>
        <div className="num">
          <div className="kpi-label">Run score</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{qualityPct(run.avgScore)}</div>
        </div>
      </div>
      {run.executionMode === "model_only" && (
        <div className="alert warn" style={{ margin: "0 16px 12px" }}>
          {prepared ? "This illustrates model-only screening with prepared responses; no candidate model was called." : "This called the candidate model directly with the golden input."} It did not execute the
          application&apos;s retrieval, tools, deterministic gates or surrounding agent flow, so it
          can shortlist models but is not sufficient evidence to claim a production swap is safe.
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Label</th>
              <th style={{ minWidth: 220 }}>Input</th>
              <th style={{ minWidth: 220 }}>Expected output</th>
              <th style={{ minWidth: 240 }}>LLM output</th>
              <th className="num">Score</th>
              <th>Result / issues</th>
            </tr>
          </thead>
          <tbody>
            {run.examples.map((example) => {
              const calculated = criterionMean(example);
              const score = run.scoreMethod === "criteria_mean" ? example.score : calculated ?? example.score;
              const passed = score != null && score >= qualityBar && !example.error;
              return (
                <tr key={example.id}>
                  <td><span className="badge neutral">{example.label}</span></td>
                  <td>{inputEvidence(example.input)}</td>
                  <td>{outputPreview(example.referenceOutput, "No expected output")}</td>
                  <td>{outputPreview(example.candidateOutput, example.error ? "Execution failed" : "No output")}</td>
                  <td className="num">
                    <div className="mono">{qualityPct(score)}</div>
                    {calculated != null && (
                      <details className="small muted" style={{ marginTop: 4 }}>
                        <summary style={{ cursor: "pointer" }}>formula</summary>
                        <div style={{ whiteSpace: "nowrap" }}>
                          mean({example.perCriterionJson.map((criterion) => qualityPct(criterion.score)).join(", ")}) = {qualityPct(calculated)}
                        </div>
                        {run.scoreMethod === "legacy_judge_overall" && example.score !== calculated && (
                          <div>Legacy judge overall was {qualityPct(example.score)}.</div>
                        )}
                      </details>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${passed ? "pass" : "warn"}`}>{passed ? "pass" : "needs attention"}</span>
                    <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
                      {example.issuesJson.map((issue) => <span className="badge warn" key={issue}>{issue.replaceAll("_", " ")}</span>)}
                    </div>
                    {example.perCriterionJson.length > 0 && (
                      <details style={{ marginTop: 7 }}>
                        <summary className="small" style={{ cursor: "pointer" }}>Criteria &amp; judge reasoning</summary>
                        <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                          {example.perCriterionJson.map((criterion) => (
                            <div className="row between small" key={criterion.criterion}>
                              <span>{criterion.criterion}</span><span className="mono">{qualityPct(criterion.score)}</span>
                            </div>
                          ))}
                          {example.reasoning && <div className="hint">{example.reasoning}</div>}
                        </div>
                      </details>
                    )}
                    {example.error && <div className="alert danger" style={{ marginTop: 6 }}>{example.error}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function EvalResultsPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: nameParam } = await params;
  const name = decodeURIComponent(nameParam);
  const client = await requireApi();
  try {
    const [detail, response] = await Promise.all([client.getRoute(name), client.evalEvidence(name)]);
    return (
      <>
        <div className="crumb"><Link href="/routes">Routes &amp; Models</Link> / <Link href={`/routes/${encodeURIComponent(name)}`}>{preparedName(name, detail.route)}</Link> / Eval results</div>
        <div className="page-head">
          <div>
            <h1>Eval results</h1>
            <p>Every input, expected answer, model output, visible score formula and issue—without hiding evidence in nested cards.</p>
          </div>
        </div>
        {isPrepared(detail.route) && <PreparedNotice />}
        <RouteTabs route={name} active="results" />
        {response.runs.length === 0 ? (
          <div className="card"><Empty emoji="◎" title="No authorized eval results yet"><p className="muted small">Choose models, calculate a budget and confirm an experiment first.</p></Empty></div>
        ) : response.runs.map((run) => <EvidenceTable prepared={isPrepared(detail.route)} key={run.id} run={run} qualityBar={detail.route.policy.minScore} />)}
      </>
    );
  } catch (error) {
    return <PageError error={error} />;
  }
}
