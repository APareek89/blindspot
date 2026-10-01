import { PreparedBadge, PreparedNotice, isPrepared } from "@/components/PreparedNotice";
import Link from "next/link";
import { preparedName } from "@/lib/format";
import { PageError } from "@/components/PageError";
import { requireApi } from "@/lib/session";
import type { GoldenExample, Trace } from "@/lib/types";
import { GoldenManager } from "./GoldenManager";

export const dynamic = "force-dynamic";

export default async function RouteGoldenPage({
  params,
  searchParams,
}: {
  params: Promise<{ route: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { route: routeParam } = await params;
  const route = decodeURIComponent(routeParam);
  const { v } = await searchParams;

  const client = await requireApi();
  try {
    const [detail, settings, contextResponse] = await Promise.all([
      client.getRoute(route),
      client.settings(),
      client.getRouteWorkflowContext(route),
    ]);
    const sets = detail.goldenSets;
    const selected = v
      ? sets.find((s) => String(s.version) === v) ?? sets[0]
      : sets[0];

    let examples: GoldenExample[] = [];
    if (selected) {
      examples = (await client.listExamples(selected.id)).examples;
    }
    let traces: Trace[] = [];
    try {
      traces = (await client.listTraces({ route, limit: 25 })).traces;
    } catch {
      /* traces are optional for promote */
    }

    return (
      <>
        <div className="crumb">
          <Link href="/golden-sets">Golden Sets</Link> / {preparedName(route, detail.route)}
        </div>
        <div className="page-head">
          <div>
            <h1>{preparedName(route, detail.route)}</h1>
            <p>
              Judge: <span className="model-ref">{settings.judgeModel ?? "default"}</span> · policy
              bar <span className="mono">{detail.route.policy.minScore.toFixed(2)}</span>. {isPrepared(detail.route) ? "Prepared entries are read-only." : "Deleting entries is always allowed; versions keep score history comparable."}
            </p>
          </div>
          <Link href={`/routes/${encodeURIComponent(route)}`} className="btn sm">
            Route detail →
          </Link>
        </div>

        {isPrepared(detail.route) && <PreparedNotice />}
        <GoldenManager
          route={route}
          routeLabel={preparedName(route, detail.route)}
          readOnly={isPrepared(detail.route)}
          sets={sets}
          selectedId={selected?.id ?? null}
          examples={examples}
          traces={traces}
          workflowContext={contextResponse.workflow_context}
        />
      </>
    );
  } catch (e) {
    return <PageError error={e} />;
  }
}
