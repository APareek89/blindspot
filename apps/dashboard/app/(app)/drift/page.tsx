import Link from "next/link";
import { PageError } from "@/components/PageError";
import { Empty } from "@/components/ui";
import { dateTime, modelName, quality } from "@/lib/format";
import { requireApi } from "@/lib/session";
import { DriftSimulator } from "./DriftSimulator";

export const dynamic = "force-dynamic";

export default async function DriftPage() {
  const client = await requireApi();
  let events;
  let routes;
  let controls;
  try {
    [events, routes, controls] = await Promise.all([
      client.driftEvents({ limit: 100 }).then((r) => r.drift_events),
      client.listRoutes({ limit: 200 }).then((r) => r.routes),
      client.getDataControls(),
    ]);
  } catch (e) {
    return <PageError error={e} />;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Drift</h1>
          <p>
            When a provider ships a new model version and quality slips, Blindspot catches it and
            surfaces an approval — it never silently reverts your live model.
          </p>
        </div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">Live operations</div>
          <div className="card-sub">Telemetry collected · alert thresholds are Phase 8</div>
          <p className="small">Errors, latency, token usage and tool/schema failures are retained from real traffic; automated threshold alerts are not active yet.</p>
        </div>
        <div className="card">
          <div className="card-title">Live answer quality</div>
          <div className="card-sub">{controls.captureMode === "full" ? "Content enabled" : "Needs full capture + judge budget"}</div>
          <p className="small">Semantic drift requires sampled inputs and outputs; metadata alone cannot judge answer quality.</p>
        </div>
        <div className="card">
          <div className="card-title">Golden-set quality</div>
          <div className="card-sub">Evidence-backed</div>
          <p className="small">Every new authorized live-model eval is compared with its prior same-version baseline.</p>
        </div>
      </div>

      {process.env.NODE_ENV !== "production" && process.env.BLINDSPOT_ENABLE_DRIFT_SIMULATOR === "true" && (
        <div style={{ marginBottom: 16 }}><DriftSimulator routes={routes} /></div>
      )}

      <div className="card pad-0">
        <div className="row between" style={{ padding: "14px 16px" }}>
          <span className="card-title">Drift timeline</span>
          <span className="muted small">{events.filter((event) => event.source !== "simulation").length} real event{events.filter((event) => event.source !== "simulation").length === 1 ? "" : "s"}</span>
        </div>
        {events.filter((event) => event.source !== "simulation").length === 0 ? (
          <Empty emoji="〜" title="No drift detected">
            <p className="muted small">
              No evidence-backed live or golden-set drift has been detected.
            </p>
          </Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Route</th>
                <th>Model</th>
                <th className="num">Score</th>
                <th>Action</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {events.filter((event) => event.source !== "simulation").map((d) => (
                <tr key={d.id}>
                  <td className="muted small">{dateTime(d.createdAt)}</td>
                  <td style={{ fontWeight: 550 }}>{d.routeName}</td>
                  <td>
                    <span className="model-ref">{modelName(d.modelRef)}</span>
                  </td>
                  <td className="num mono">
                    <span className="muted">{quality(d.oldScore)}</span>
                    <span className="muted"> → </span>
                    <span className="delta-up">{quality(d.newScore)}</span>
                  </td>
                  <td>
                    <span className={`badge ${d.action === "auto_approved" ? "warn" : "accent"}`}>
                      {d.action.replace("_", " ")}
                    </span>
                    <span className="badge neutral" style={{ marginLeft: 5 }}>{d.source.replace("_", " ")}</span>
                  </td>
                  <td className="num">
                    {d.recommendationId ? (
                      <Link href="/approvals" className="btn-link">
                        View recommendation →
                      </Link>
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
