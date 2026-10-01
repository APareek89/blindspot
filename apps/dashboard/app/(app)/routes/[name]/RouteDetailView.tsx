"use client";

import { useOwnerGuard } from "@/components/AccountShell";

import { isPrepared } from "@/components/PreparedNotice";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ScoreChart } from "@/components/charts";
import { costPer1k, modelName, ms, qualityPct, preparedName } from "@/lib/format";
import type {
  EvalPlan,
  EvalRunEvidence,
  EvalExecutionMode,
  ModelCompatibility,
  RouteDetail,
  RouteModelCompatibility,
} from "@/lib/types";
import {
  addCandidateA,
  estimateEvalA,
  removeCandidateA,
  runEvalPlanA,
  savePolicy,
} from "../actions";

function capabilityLabels(model: ModelCompatibility): string[] {
  return [
    ...(model.capabilities.toolCalling ? ["tools"] : []),
    ...(model.capabilities.structuredOutput ? ["structured"] : []),
    ...(model.capabilities.streaming ? ["streaming"] : []),
    ...(model.capabilities.inputModalities.includes("image") ? ["vision"] : []),
    ...(model.capabilities.contextTokens
      ? [`${Math.round(model.capabilities.contextTokens / 1000)}K context`]
      : []),
  ];
}

function priceLabel(model: ModelCompatibility): string {
  if (model.inputUsdPerMillion == null || model.outputUsdPerMillion == null) {
    return "Pricing unavailable";
  }
  return `$${model.inputUsdPerMillion}/$${model.outputUsdPerMillion} per MTok in/out`;
}

function usdFromCents(cents: number | null): string {
  return cents == null ? "—" : `$${(cents / 100).toFixed(4)}`;
}

export function RouteDetailView({
  detail,
  compatibility,
  evidence,
}: {
  detail: RouteDetail;
  compatibility: RouteModelCompatibility;
  evidence: EvalRunEvidence[];
}) {
  const guard = useOwnerGuard();
  const route = detail.route.name;
  const prepared = isPrepared(detail.route);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>(
    detail.route.liveModel ? [detail.route.liveModel] : [],
  );
  const [budgetUsd, setBudgetUsd] = useState(0.05);
  const [executionMode, setExecutionMode] = useState<EvalExecutionMode>(
    compatibility.workflow?.replayReady ? "workflow_replay" : "model_only",
  );
  const [plan, setPlan] = useState<EvalPlan | null>(null);

  const [minScore, setMinScore] = useState(detail.route.policy.minScore);
  const pooledModels = new Set(detail.candidates.map((candidate) => candidate.modelRef));
  const technicallyEligible = new Set(
    compatibility.eligible.map((candidate) => candidate.modelRef),
  );

  const run = (fn: () => Promise<{ ok: boolean; error?: string } | null>, ok?: string) => {
    setError(null);
    setMsg(null);
    start(async () => {
      const ticket = guard.capture();
      const r = await fn();
      if (!r || !guard.current(ticket)) return;
      if (!r.ok) setError(r.error ?? "failed");
      else if (ok) setMsg(ok);
    });
  };

  const toggleModel = (modelRef: string) => {
    setPlan(null);
    setSelectedModels((current) =>
      current.includes(modelRef)
        ? current.filter((item) => item !== modelRef)
        : [...current, modelRef],
    );
  };

  const estimate = () => {
    setError(null);
    setMsg(null);
    setPlan(null);
    start(async () => {
      const ticket = guard.capture();
      const result = await guard.run((ownerId) => estimateEvalA(route, selectedModels, budgetUsd, executionMode, ownerId));
      if (!result || !guard.current(ticket)) return;
      if (!result.ok) setError(result.error);
      else setPlan(result.plan);
    });
  };

  const confirmPlan = () => {
    if (!plan) return;
    setError(null);
    setMsg(null);
    start(async () => {
      const ticket = guard.capture();
      const result = await guard.run((ownerId) => runEvalPlanA(route, plan.id, ownerId));
      if (!result || !guard.current(ticket)) return;
      if (!result.ok) {
        setError(result.error ?? "eval failed");
        return;
      }
      setPlan(null);
      setMsg("Experiment completed. Evidence and any Recommendation are now available.");
    });
  };

  return (
    <fieldset disabled={prepared} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      {error && (
        <div className="alert danger" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}
      {msg && (
        <div className="alert info" style={{ marginBottom: 14 }}>
          {msg}
        </div>
      )}

      <div className={`alert ${detail.route.integrationMode === "managed" ? "info" : "warn"}`} style={{ marginBottom: 14 }}>
        <strong>{detail.route.integrationMode === "managed" ? "Managed routing" : "Observe-only connection"}.</strong>{" "}
        {detail.route.integrationMode === "managed"
          ? "Approved changes can be resolved by the connected application."
          : "Blindspot can recommend a model, but approval means awaiting app rollout—it will not claim the application changed."}
      </div>

      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        {/* policy + automation */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>
            Policy &amp; automation
          </div>
          <div className="field">
            <label className="label">Quality bar — cheapest candidate scoring ≥</label>
            <div className="row" style={{ gap: 8 }}>
              <input aria-label="Quality bar — cheapest candidate scoring ≥"
                className="input mono"
                type="number"
                min={0}
                max={1}
                step={0.01}
                style={{ width: 110 }}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
              />
              <button
                className="btn"
                disabled={pending || minScore === detail.route.policy.minScore}
                onClick={() => run(() => guard.run((ownerId) => savePolicy(route, { minScore }, ownerId)), "Policy updated.")}
              >
                Save bar
              </button>
            </div>
          </div>
          <div className="divider" />
          <div className="row between">
            <div>
              <div style={{ fontWeight: 550 }}>Auto-approve</div>
              <div className="muted small" style={{ maxWidth: 320 }}>
                Only fires when a candidate is within the band <em>and</em> cheaper. Default off.
              </div>
            </div>
            <button
              className={`toggle ${detail.route.autoApprove ? "on" : ""}`}
              disabled={pending}
              onClick={() =>
                run(
                  () => guard.run((ownerId) => savePolicy(route, { autoApprove: !detail.route.autoApprove }, ownerId)),
                  `Auto-approve ${detail.route.autoApprove ? "disabled" : "enabled"}.`,
                )
              }
              role="switch" aria-checked={detail.route.autoApprove} aria-label="Auto-approve"
            />
          </div>
        </div>

        {/* quick actions */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>Experiment steps</div>
          <div className="stack small" style={{ gap: 8 }}>
            <div><span className="badge neutral">1</span> Add only technically compatible models.</div>
            <div><span className="badge neutral">2</span> Select the live model and candidates.</div>
            <div><span className="badge neutral">3</span> Calculate cost and disclosed sampling.</div>
            <div><span className="badge neutral">4</span> Confirm the paid run.</div>
            <div><span className="badge neutral">5</span> Review every output before any approval.</div>
            <Link href={`/routes/${encodeURIComponent(route)}/evals`} className="btn">
              Open Eval Results ({evidence.length})
            </Link>
            {detail.pendingRecs > 0 && (
              <Link href="/approvals" className="btn primary">
                {detail.pendingRecs} pending approval{detail.pendingRecs === 1 ? "" : "s"} →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* score over time */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title" style={{ marginBottom: 4 }}>
          {prepared ? "Illustrative score over time" : "Live-model score over time"}
        </div>
        <div className="card-sub" style={{ marginBottom: 12 }}>
          Dashed line = policy bar. Vertical marks = golden-set version changes.
        </div>
        <ScoreChart series={detail.scoreSeries} bar={detail.route.policy.minScore} />
      </div>

      {/* candidate pool */}
      <div className="card pad-0" style={{ marginBottom: 14 }}>
        <div className="row between" style={{ padding: "14px 16px" }}>
          <span className="card-title">Candidate pool</span>
          <span className="muted small">{prepared ? "Prepared fixture scores · no model call" : "quality evidence appears after an approved eval"}</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Source</th>
              <th className="num">Score</th>
              <th className="num">Cost/1k</th>
              <th className="num">Latency</th>
              <th className="num">Experiment</th>
            </tr>
          </thead>
          <tbody>
            {detail.candidates.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="model-ref">{modelName(c.modelRef)}</span>
                  {c.isLive && (
                    <span className="badge pass" style={{ marginLeft: 8 }}>
                      {prepared ? "prepared baseline" : "live"}
                    </span>
                  )}
                </td>
                <td className="muted small">{c.source}</td>
                <td className="num mono">{qualityPct(c.score)}{prepared && <div className="small muted">illustrative</div>}</td>
                <td className="num mono">{costPer1k(c.costPer1kCents)}{prepared && <div className="small muted">no provider charge</div>}</td>
                <td className="num mono">{ms(c.latencyMs)}</td>
                <td className="num">
                  <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                    {technicallyEligible.has(c.modelRef) ? (
                      <label className="row small" style={{ gap: 6, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={selectedModels.includes(c.modelRef)}
                          disabled={pending}
                          onChange={() => toggleModel(c.modelRef)}
                        />
                        select
                      </label>
                    ) : (
                      <span className="muted small">not eligible</span>
                    )}
                    {!c.isLive && (
                      <button
                        className="btn sm danger-ghost"
                        disabled={pending}
                        onClick={() => run(() => guard.run((ownerId) => removeCandidateA(route, c.modelRef, ownerId)), "Candidate removed.")}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row between wrap" style={{ marginBottom: 4 }}>
          <span className="card-title">Experiment budget</span>
          <span className="badge cyan">Estimate → confirm → run</span>
        </div>
        <div className="card-sub" style={{ marginBottom: 12 }}>
          Select technically eligible models in the candidate pool. Calculating an estimate is
          free; provider calls begin only after you confirm the disclosed plan.
        </div>
        <div className="grid cols-2" style={{ marginBottom: 14 }}>
          <button
            className={`card ${executionMode === "model_only" ? "selected" : ""}`}
            style={{ textAlign: "left" }}
            onClick={() => { setExecutionMode("model_only"); setPlan(null); }}
          >
            <div className="card-title">Model-only screening</div>
            <div className="card-sub">Fast shortlist. Direct prompt call; no production swap recommendation.</div>
          </button>
          <button
            className={`card ${executionMode === "workflow_replay" ? "selected" : ""}`}
            style={{ textAlign: "left", opacity: compatibility.workflow?.replayReady ? 1 : 0.55 }}
            disabled={!compatibility.workflow?.replayReady}
            onClick={() => { setExecutionMode("workflow_replay"); setPlan(null); }}
          >
            <div className="card-title">Actual workflow replay</div>
            <div className="card-sub">
              {compatibility.workflow?.replayReady
                ? "Runs the connected app callback. Required for a production recommendation."
                : "Configure the protected replay callback under Workflows first."}
            </div>
          </button>
        </div>
        <div className="row wrap" style={{ gap: 8, alignItems: "flex-end" }}>
          <div>
            <label className="label">Maximum spend (USD)</label>
            <input aria-label="Maximum spend (USD)"
              className="input mono"
              type="number"
              min={0.001}
              max={100}
              step={0.01}
              value={budgetUsd}
              style={{ width: 130 }}
              onChange={(event) => {
                setBudgetUsd(Number(event.target.value));
                setPlan(null);
              }}
            />
          </div>
          <button
            className="btn primary"
            disabled={pending || selectedModels.length === 0 || budgetUsd <= 0}
            onClick={estimate}
          >
            {pending ? "Calculating…" : `Calculate for ${selectedModels.length || 0} model${selectedModels.length === 1 ? "" : "s"}`}
          </button>
          <span className="muted small">
            Selected: {selectedModels.map(modelName).join(", ") || "none"}
          </span>
        </div>

        {plan && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="row between wrap" style={{ marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {plan.disclosure.mode === "full" ? "Full golden-set run" : "Stratified sample"}
                </div>
                <div className="muted small">
                  {plan.disclosure.executionMode === "workflow_replay" ? "Actual workflow replay" : "Model-only screening"}
                </div>
                <div className="muted small mono">seed {plan.disclosure.seed}</div>
              </div>
              <span className={`badge ${plan.disclosure.mode === "full" ? "pass" : "warn"}`}>
                {plan.disclosure.selectedExampleIds.length}/{plan.disclosure.fullExampleCount} examples
              </span>
            </div>
            <div className="grid cols-3" style={{ marginBottom: 10 }}>
              <div>
                <div className="kpi-label">Estimated run</div>
                <div className="mono">{usdFromCents(plan.disclosure.selectedEstimatedCostCents)}</div>
              </div>
              <div>
                <div className="kpi-label">Full estimate</div>
                <div className="mono">{usdFromCents(plan.disclosure.fullEstimatedCostCents)}</div>
              </div>
              <div>
                <div className="kpi-label">Your cap</div>
                <div className="mono">{usdFromCents(plan.disclosure.budgetCents)}</div>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 5, marginBottom: 9 }}>
              {Object.entries(plan.disclosure.strataSelected).map(([stratum, count]) => (
                <span className="badge neutral" key={stratum}>
                  {stratum.replaceAll("_", " ")}: {count}/
                  {plan.disclosure.strataAvailable[stratum as keyof typeof plan.disclosure.strataAvailable]}
                </span>
              ))}
              {plan.disclosure.omittedExampleCount > 0 && (
                <span className="badge warn">omitted: {plan.disclosure.omittedExampleCount}</span>
              )}
            </div>
            <div className="muted small" style={{ marginBottom: 8 }}>
              {plan.disclosure.confidenceNote}
            </div>
            <div className="stack" style={{ gap: 6, marginBottom: 10 }}>
              {plan.disclosure.modelEstimates.map((estimate) => (
                <div className="row between small" key={estimate.modelRef}>
                  <span className="mono">{modelName(estimate.modelRef)}</span>
                  <span className="mono muted">
                    {estimate.calls} calls · {usdFromCents(estimate.estimatedCostCents)}
                  </span>
                </div>
              ))}
            </div>
            <details style={{ marginBottom: 10 }}>
              <summary style={{ cursor: "pointer", fontWeight: 550 }}>
                Review exact selected and omitted cases
              </summary>
              <div className="grid cols-2" style={{ marginTop: 8 }}>
                <div>
                  <div className="kpi-label">Selected</div>
                  <div className="stack" style={{ gap: 5 }}>
                    {plan.disclosure.selectedExamples.map((example) => (
                      <div className="hint small" key={example.id}>
                        <span className="badge neutral">{example.label}</span>{" "}
                        {example.input.slice(0, 180)}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="kpi-label">Omitted</div>
                  {plan.disclosure.omittedExamples.length === 0 ? (
                    <div className="hint small">None — this is the full set.</div>
                  ) : (
                    <div className="stack" style={{ gap: 5 }}>
                      {plan.disclosure.omittedExamples.map((example) => (
                        <div className="hint small" key={example.id}>
                          <span className="badge neutral">{example.label}</span>{" "}
                          {example.input.slice(0, 180)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </details>
            <div className="hint" style={{ marginBottom: 10 }}>
              Safety: {plan.disclosure.safetyMethod}. Plan expires in 30 minutes and freezes the
              selected examples; it cannot be run twice.
            </div>
            <button
              className="btn primary"
              disabled={pending || plan.status !== "draft"}
              onClick={confirmPlan}
            >
              {pending ? "Running…" : `Confirm & run · max ${usdFromCents(plan.budgetCents)}`}
            </button>
          </div>
        )}
      </div>

      {/* technically compatible catalog */}
      <div className="card">
        <div className="row between wrap" style={{ marginBottom: 4 }}>
          <span className="card-title">Compatible models</span>
          <span className="badge cyan">Technical gate</span>
        </div>
        <div className="card-sub" style={{ marginBottom: 12 }}>
          Models are matched against the requirements Blindspot observed at this exact agent node.
          Quality is evaluated separately on your golden set.
        </div>

        {compatibility.workflow && (
          <div className="hint" style={{ marginBottom: 12 }}>
            Source: <span className="mono">{preparedName(compatibility.workflow.name, detail.route)}</span> →{" "}
            <span className="mono">{compatibility.workflow.nodeName}</span>
          </div>
        )}
        {!compatibility.optimizationAllowed && (
          <div className="alert warn" style={{ marginBottom: 12 }}>
            {compatibility.optimizationBlockedReason}.{" "}
            <Link href="/workflows">Choose it under Workflows →</Link>
          </div>
        )}

        {compatibility.eligible.length === 0 ? (
          <div className="alert info" style={{ marginBottom: 12 }}>
            No model is eligible yet. Sync Anthropic under <Link href="/settings">Settings</Link>{" "}
            or inspect the exclusion reasons below.
          </div>
        ) : (
          <div className="grid cols-2" style={{ marginBottom: 14 }}>
            {compatibility.eligible.map((model) => {
              const inPool = pooledModels.has(model.modelRef);
              return (
                <div className="card" key={model.modelRef}>
                  <div className="row between wrap" style={{ marginBottom: 7 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{model.displayName}</div>
                      <div className="mono muted small">{model.modelRef}</div>
                    </div>
                    <span className="badge pass">Compatible</span>
                  </div>
                  <div className="row wrap" style={{ gap: 5, marginBottom: 9 }}>
                    {capabilityLabels(model).map((capability) => (
                      <span className="badge neutral" key={capability}>
                        {capability}
                      </span>
                    ))}
                  </div>
                  <div className="muted small" style={{ marginBottom: 10 }}>
                    {priceLabel(model)}
                  </div>
                  <button
                    className={`btn sm ${inPool ? "" : "primary"}`}
                    disabled={pending || inPool || !compatibility.optimizationAllowed}
                    onClick={() =>
                      run(
                        () => guard.run((ownerId) => addCandidateA(route, model.modelRef, ownerId)),
                        "Candidate added. No eval spend yet — budget approval comes next.",
                      )
                    }
                  >
                    {inPool ? "In candidate pool" : "Add candidate"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <details>
          <summary style={{ cursor: "pointer", fontWeight: 550 }}>
            Excluded models ({compatibility.excluded.length})
          </summary>
          <div className="stack" style={{ marginTop: 10, gap: 8 }}>
            {compatibility.excluded.map((model) => (
              <div className="card" key={model.modelRef}>
                <div className="row between wrap" style={{ marginBottom: 5 }}>
                  <span style={{ fontWeight: 550 }}>{model.displayName}</span>
                  <span className="badge warn">{model.status.replaceAll("_", " ")}</span>
                </div>
                <ul className="muted small" style={{ paddingLeft: 18 }}>
                  {model.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
        <div className="hint">
          Adding a compatible model only creates an experiment candidate. Blindspot will show the
          full eval estimate and sampling plan before any paid run.
        </div>
      </div>

    </fieldset>
  );
}
