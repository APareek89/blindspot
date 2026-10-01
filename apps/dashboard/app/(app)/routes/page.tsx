import { PreparedBadge, PreparedNotice, isPrepared } from "@/components/PreparedNotice";
import Link from "next/link";
import { PageError } from "@/components/PageError";
import { Empty, Sparkline, StatusBadge } from "@/components/ui";
import { costPer1k, modelName, qualityPct, preparedName } from "@/lib/format";
import { requireApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function RoutesPage() {
  const client = await requireApi();
  let data;
  try {
    data = await client.listRoutes({ limit: 200 });
  } catch (e) {
    return <PageError error={e} />;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Routes &amp; Models</h1>
          <p>Every call-site in your agent, its live model, and how it’s doing against its bar.</p>
        </div>
      </div>

      {data.routes.length === 0 ? (
        <div className="card">
          <Empty emoji="⌘" title="No routes yet">
            <p className="muted small">
              Point your app at the gateway and call{" "}
              <span className="model-ref">route:&lt;name&gt;</span>. See{" "}
              <Link href="/connect" className="btn-link">
                Connect
              </Link>
              .
            </p>
          </Empty>
        </div>
      ) : (
        <div className="card pad-0">
          <table className="table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Live model</th>
                <th>Quality</th>
                <th className="num">Cost/1k</th>
                <th className="num">Bar</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.routes.map((r) => (
                <tr key={r.id} className="clickable">
                  <td style={{ fontWeight: 550 }}>
                    <Link href={`/routes/${encodeURIComponent(r.name)}`}>{preparedName(r.name, r)}</Link> <PreparedBadge record={r} />
                    {r.pendingRecs > 0 && (
                      <span className="badge warn" style={{ marginLeft: 8 }}>
                        {r.pendingRecs} pending
                      </span>
                    )}
                  </td>
                  <td>
                    {r.liveModel ? <span className="model-ref">{modelName(r.liveModel)}</span> : <span className="muted">—</span>}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <Sparkline values={r.sparkline} />
                      <span className="mono small">{qualityPct(r.quality)}</span>
                    </div>
                  </td>
                  <td className="num mono">{costPer1k(r.costPer1kCents)}</td>
                  <td className="num mono">{r.policy.minScore.toFixed(2)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
