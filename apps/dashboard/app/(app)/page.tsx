import Link from "next/link";
import { CostQualityChart } from "@/components/charts";
import { PageError } from "@/components/PageError";
import { Empty } from "@/components/ui";
import { requireApi } from "@/lib/session";
import { cents, qualityPct, relTime } from "@/lib/format";

export const dynamic = "force-dynamic";

function Kpi({
  label,
  value,
  foot,
  href,
  accent,
}: {
  label: string;
  value: string;
  foot?: string;
  href?: string;
  accent?: string;
}) {
  const body = (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function OverviewPage() {
  const client = await requireApi();
  let ov;
  try {
    ov = await client.overview();
  } catch (e) {
    return <PageError error={e} />;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>Quality, realized savings, and everything waiting on your approval — at a glance.</p>
        </div>
      </div>

      <div className="grid cols-5" style={{ marginBottom: 14 }}>
        <Kpi label="Avg quality" value={qualityPct(ov.avgQuality)} foot="across live models" />
        <Kpi
          label="Saved (realized)"
          value={`${cents(ov.savedCentsPer1kRealized)}/1k`}
          foot={`${cents(ov.savedCentsPer1kPending)}/1k pending approval · ${cents(ov.savedCentsPer1kAwaitingRollout)}/1k awaiting rollout`}
          accent="var(--pass)"
        />
        <Kpi
          label="Pending approvals"
          value={String(ov.pendingApprovals)}
          foot="in the inbox"
          href="/approvals"
          accent={ov.pendingApprovals > 0 ? "var(--warn)" : undefined}
        />
        <Kpi
          label="Drift alerts"
          value={String(ov.driftAlerts)}
          foot="version-bump events"
          href="/drift"
          accent={ov.driftAlerts > 0 ? "var(--danger)" : undefined}
        />
        <Kpi
          label="Routes"
          value={`${ov.routesHealthy}/${ov.routeCount}`}
          foot={`${ov.routesAtRisk} at risk · ${ov.routesUnevaluated} unevaluated`}
          href="/routes"
        />
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 4 }}>
            Cost vs quality
          </div>
          <div className="card-sub" style={{ marginBottom: 12 }}>
            Each dot is a route’s live model. Up = better quality, left = cheaper.
          </div>
          <CostQualityChart points={ov.costVsQuality} />
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>
            Activity
          </div>
          {ov.activity.length === 0 ? (
            <Empty emoji="◍" title="No activity yet">
              <p className="muted small">Connect an app and evals will start showing up here.</p>
            </Empty>
          ) : (
            <div className="stack" style={{ gap: 0 }}>
              {ov.activity.map((a, i) => (
                <div
                  key={i}
                  className="row between"
                  style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}
                >
                  <div className="row" style={{ gap: 10 }}>
                    <span className={`badge ${a.kind === "drift" ? "danger" : "accent"}`}>
                      {a.kind === "drift" ? "Drift" : "Rec"}
                    </span>
                    <div>
                      <div style={{ fontWeight: 550 }}>{a.routeName}</div>
                      <div className="muted small mono">{a.detail}</div>
                    </div>
                  </div>
                  <div className="muted small">{relTime(a.at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
