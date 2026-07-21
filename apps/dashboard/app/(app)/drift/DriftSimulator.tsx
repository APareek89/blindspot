"use client";

import { useState, useTransition } from "react";
import type { RouteSummary } from "@/lib/types";
import { simulateDrift } from "./actions";

export function DriftSimulator({ routes }: { routes: RouteSummary[] }) {
  const evaluable = routes.filter((r) => r.liveModel && r.hasGoldenSet);
  const [route, setRoute] = useState(evaluable[0]?.name ?? "");
  const [score, setScore] = useState(0.4);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 4 }}>
        Developer-only drift simulator
      </div>
      <div className="card-sub" style={{ marginBottom: 12 }}>
        Inject a demonstration score. It is tagged simulation and never enters eval evidence,
        route health, or the Approvals inbox.
      </div>

      {evaluable.length === 0 ? (
        <p className="muted small">Need a route with a live model and a golden set first.</p>
      ) : (
        <>
          <div className="row wrap" style={{ gap: 8, alignItems: "flex-end" }}>
            <div>
              <label className="label">Route</label>
              <select className="select" style={{ width: 180 }} value={route} onChange={(e) => setRoute(e.target.value)}>
                {evaluable.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Simulated new score</label>
              <input
                className="input mono"
                type="number"
                min={0}
                max={1}
                step={0.05}
                style={{ width: 110 }}
                value={score}
                onChange={(e) => setScore(Number(e.target.value))}
              />
            </div>
            <button
              className="btn"
              disabled={pending || !route}
              onClick={() => {
                setMsg(null);
                setError(null);
                start(async () => {
                  const r = await simulateDrift(route, score);
                  if (!r.ok) setError(r.error);
                  else setMsg("Drift check ran — see the timeline and Approvals.");
                });
              }}
            >
              {pending ? "Running…" : "Simulate drift"}
            </button>
          </div>
          {msg && (
            <div className="alert info" style={{ marginTop: 12 }}>
              {msg}
            </div>
          )}
          {error && (
            <div className="alert danger" style={{ marginTop: 12 }}>
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
