import { PreparedBadge, PreparedNotice, isPrepared } from "@/components/PreparedNotice";
import Link from "next/link";
import { PageError } from "@/components/PageError";
import { StatusBadge } from "@/components/ui";
import { modelName, preparedName } from "@/lib/format";
import { requireApi } from "@/lib/session";
import type { RouteStatus } from "@/lib/types";
import { RouteDetailView } from "./RouteDetailView";
import { RouteTabs } from "./RouteTabs";

export const dynamic = "force-dynamic";

export default async function RouteDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: nameParam } = await params;
  const name = decodeURIComponent(nameParam);

  const client = await requireApi();
  try {
    const [detail, compatibility, evidence] = await Promise.all([
      client.getRoute(name),
      client.getRouteCompatibility(name),
      client.evalEvidence(name),
    ]);
    const q = detail.route.liveModel ? detail.scoreSeries.at(-1)?.score ?? null : null;
    const status: RouteStatus =
      !detail.route.liveModel || detail.goldenSets.length === 0 || q == null
        ? "unevaluated"
        : q < detail.route.policy.minScore || detail.pendingRecs > 0
          ? "at_risk"
          : "healthy";

    return (
      <>
        <div className="crumb">
          <Link href="/routes">Routes &amp; Models</Link> / {preparedName(name, detail.route)}
        </div>
        <div className="page-head">
          <div>
            <div className="row" style={{ gap: 10 }}>
              <h1>{preparedName(name, detail.route)}</h1>
              <StatusBadge status={status} />
            </div>
            <p>
              Live model:{" "}
              {detail.route.liveModel ? (
                <span className="model-ref">{modelName(detail.route.liveModel)}</span>
              ) : (
                "none"
              )}
            </p>
          </div>
          <Link href={`/golden-sets/${encodeURIComponent(name)}`} className="btn sm">
            Golden set →
          </Link>
        </div>

        {isPrepared(detail.route) && <PreparedNotice />}
        <RouteTabs route={name} active="experiment" />

        <RouteDetailView
          detail={detail}
          compatibility={compatibility}
          evidence={evidence.runs}
        />
      </>
    );
  } catch (e) {
    return <PageError error={e} />;
  }
}
