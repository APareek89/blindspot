"use client";

import { useOwnerGuard } from "@/components/AccountShell";

import { useState, useTransition } from "react";
import { Meter, RecStatusBadge } from "@/components/ui";
import { modelName, pct, qualityPct, signedMs } from "@/lib/format";
import type { Recommendation } from "@/lib/types";
import { approveRec, rejectRec } from "./actions";

function DeltaCost({ v }: { v: number | null }) {
  return (
    <span className={v != null && v < 0 ? "delta-down" : v != null && v > 0 ? "delta-up" : ""}>
      {v == null ? "cost not comparable" : `${pct(v)} cost`}
    </span>
  );
}

export function ApprovalsInbox({ recommendations }: { recommendations: Recommendation[] }) {
  const guard = useOwnerGuard();
  const [open, setOpen] = useState<Recommendation | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const act = (fn: () => Promise<{ ok: boolean; error?: string } | null>) => {
    setError(null);
    start(async () => {
      const ticket = guard.capture();
      const r = await fn();
      if (!r || !guard.current(ticket)) return;
      if (!r.ok) setError(r.error ?? "failed");
      else setOpen(null);
    });
  };

  if (recommendations.length === 0) return null;

  return (
    <>
      <div className="card pad-0">
        {recommendations.map((r) => {
          const e = r.evidenceJson;
          return (
            <div
              key={r.id}
              className="row between"
              style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", gap: 14 }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
                  <span className="badge accent">{r.routeName}</span>
                  <RecStatusBadge status={r.status} />
                  <span className={`badge ${r.applicationStatus === "applied" ? "pass" : r.applicationStatus === "awaiting_rollout" ? "warn" : "neutral"}`}>
                    {r.applicationStatus.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span className="model-ref">{r.fromModel ? modelName(r.fromModel) : "—"}</span>
                  <span className="muted">→</span>
                  <span className="model-ref">{modelName(r.toModel)}</span>
                  <span className="muted small">
                    quality {qualityPct(e.fromScore)} → {qualityPct(e.toScore)} · <DeltaCost v={e.costDeltaPct} />
                  </span>
                </div>
              </div>
              <div className="row" style={{ gap: 8, flex: "none" }}>
                <button className="btn sm" onClick={() => setOpen(r)}>
                  View evidence
                </button>
                {r.status === "pending" && (
                  <>
                    <button className="btn sm pass" disabled={pending} onClick={() => act(() => guard.run((ownerId) => approveRec(r.id, ownerId)))}>
                      {r.integrationMode === "managed" ? "Approve & apply" : "Approve recommendation"}
                    </button>
                    <button
                      className="btn sm danger-ghost"
                      disabled={pending}
                      onClick={() => act(() => guard.run((ownerId) => rejectRec(r.id, undefined, ownerId)))}
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {open && (
        <EvidenceDrawer
          rec={open}
          pending={pending}
          error={error}
          rejectReason={rejectReason}
          onReason={setRejectReason}
          onClose={() => {
            setOpen(null);
            setError(null);
          }}
          onApprove={() => act(() => guard.run((ownerId) => approveRec(open.id, ownerId)))}
          onReject={() => act(() => guard.run((ownerId) => rejectRec(open.id, rejectReason, ownerId)))}
        />
      )}
    </>
  );
}

function EvidenceDrawer({
  rec,
  pending,
  error,
  rejectReason,
  onReason,
  onClose,
  onApprove,
  onReject,
}: {
  rec: Recommendation;
  pending: boolean;
  error: string | null;
  rejectReason: string;
  onReason: (s: string) => void;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const e = rec.evidenceJson;
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <span className="badge accent">{rec.routeName}</span>
              <RecStatusBadge status={rec.status} />
              <span className={`badge ${rec.applicationStatus === "applied" ? "pass" : rec.applicationStatus === "awaiting_rollout" ? "warn" : "neutral"}`}>
                {rec.applicationStatus.replaceAll("_", " ")}
              </span>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="model-ref">{rec.fromModel ? modelName(rec.fromModel) : "—"}</span>
              <span className="muted">→</span>
              <span className="model-ref">{modelName(rec.toModel)}</span>
            </div>
          </div>
          <button aria-label="Close evidence" className="drawer-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="drawer-body">
          <div className={`alert ${rec.integrationMode === "managed" ? "info" : "warn"}`} style={{ marginBottom: 16 }}>
            {rec.integrationMode === "managed"
              ? "Managed route: approval updates the model Blindspot resolves for the application."
              : "Observe-only route: approval records the decision, but the application must roll it out. Blindspot will mark it applied only after it observes the target model."}
          </div>
          {/* headline deltas */}
          <div className="grid cols-3" style={{ marginBottom: 18 }}>
            <div className="card">
              <div className="kpi-label">Quality</div>
              <div className="kpi-value" style={{ fontSize: 20 }}>
                {qualityPct(e.fromScore)} → {qualityPct(e.toScore)}
              </div>
            </div>
            <div className="card">
              <div className="kpi-label">Cost</div>
              <div
                className="kpi-value"
                style={{
                  fontSize: 20,
                  color:
                    e.costDeltaPct == null
                      ? "var(--muted)"
                      : e.costDeltaPct < 0
                        ? "var(--pass)"
                        : "var(--danger)",
                }}
              >
                {pct(e.costDeltaPct)}
              </div>
            </div>
            <div className="card">
              <div className="kpi-label">Latency</div>
              <div className="kpi-value" style={{ fontSize: 20 }}>
                {signedMs(e.latencyDeltaMs)}
              </div>
            </div>
          </div>

          {/* per-criterion */}
          <div className="card-title" style={{ marginBottom: 10 }}>
            Per-criterion scores
          </div>
          {e.perCriterion.length > 0 ? (
            <div className="stack" style={{ gap: 12, marginBottom: 20 }}>
              {e.perCriterion.map((c, i) => (
                <div key={i}>
                  <div className="row between small" style={{ marginBottom: 5 }}>
                    <span>{c.criterion}</span>
                    <span className="mono">
                      {c.from != null ? c.from.toFixed(2) : "—"} → {c.to.toFixed(2)}
                    </span>
                  </div>
                  <Meter value={c.to} />
                </div>
              ))}
            </div>
          ) : (
            <div className="alert info" style={{ marginBottom: 20 }}>
              Per-criterion breakdown is captured once per-example outputs are stored (Phase 4.5).
              The aggregate scores and cost/latency deltas above carry this recommendation.
            </div>
          )}

          {/* samples */}
          <div className="card-title" style={{ marginBottom: 10 }}>
            Side-by-side samples
          </div>
          {e.samples.length > 0 ? (
            <div className="stack" style={{ gap: 14, marginBottom: 20 }}>
              {e.samples.map((s, i) => (
                <div key={i}>
                  <div className="muted small" style={{ marginBottom: 6 }}>
                    <span className="mono">{s.input.slice(0, 120)}</span>
                  </div>
                  <div className="compare">
                    <div className="cell">
                      <div className="cell-head">{modelName(rec.fromModel)}</div>
                      {s.fromOutput ?? "—"}
                    </div>
                    <div className="cell">
                      <div className="cell-head">{modelName(rec.toModel)}</div>
                      {s.toOutput}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="alert info" style={{ marginBottom: 20 }}>
              Side-by-side output samples populate once per-example outputs are stored (Phase 4.5).
            </div>
          )}

          {rec.status === "rejected" && rec.reason && (
            <div className="alert warn" style={{ marginBottom: 16 }}>
              Rejected: {rec.reason}
            </div>
          )}

          {rec.status === "pending" && (
            <>
              <div className="divider" />
              <div className="field">
                <label className="label">Rejection reason (optional — tunes future recs)</label>
                <textarea aria-label="Rejection reason (optional — tunes future recs)"
                  className="textarea"
                  style={{ minHeight: 56, fontFamily: "var(--sans)" }}
                  value={rejectReason}
                  onChange={(ev) => onReason(ev.target.value)}
                  placeholder="e.g. tone was too terse for our brand"
                />
              </div>
              {error && (
                <div className="alert danger" style={{ marginBottom: 12 }}>
                  {error}
                </div>
              )}
              <div className="row" style={{ gap: 8 }}>
                <button className="btn pass" disabled={pending} onClick={onApprove}>
                  {pending ? "Working…" : rec.integrationMode === "managed" ? "Approve & apply" : "Approve recommendation"}
                </button>
                <button className="btn danger-ghost" disabled={pending} onClick={onReject}>
                  Reject
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
