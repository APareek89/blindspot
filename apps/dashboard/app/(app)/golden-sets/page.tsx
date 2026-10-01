import { PreparedBadge } from "@/components/PreparedNotice";
import Link from "next/link";
import { preparedName } from "@/lib/format";
import { PageError } from "@/components/PageError";
import { Empty } from "@/components/ui";
import { modelName } from "@/lib/format";
import { requireApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function GoldenIndex() {
  const client = await requireApi();
  let routes;
  try {
    routes = (await client.listRoutes({ limit: 200 })).routes;
  } catch (e) {
    return <PageError error={e} />;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Golden Sets</h1>
          <p>
            The living definition of “good” for each route. Seed by upload or agent, grow from
            production, curate freely — pick a route to manage its set.
          </p>
        </div>
      </div>

      {routes.length === 0 ? (
        <div className="card">
          <Empty emoji="✷" title="No routes yet">
            <p className="muted small">
              Connect an app and call <span className="model-ref">route:&lt;name&gt;</span> — routes
              appear here, then you can give each one a golden set.
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
                <th>Golden set</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 550 }}>{preparedName(r.name, r)} <PreparedBadge record={r} /></td>
                  <td>
                    {r.liveModel ? <span className="model-ref">{modelName(r.liveModel)}</span> : "—"}
                  </td>
                  <td>
                    {r.hasGoldenSet ? (
                      <span className="badge pass">Configured</span>
                    ) : (
                      <span className="badge neutral">Not set up</span>
                    )}
                  </td>
                  <td className="num">
                    <Link href={`/golden-sets/${encodeURIComponent(r.name)}`} className="btn sm">
                      {r.hasGoldenSet ? "Manage" : "Set up"}
                    </Link>
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
