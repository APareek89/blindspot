import Link from "next/link";

export function RouteTabs({ route, active }: { route: string; active: "experiment" | "results" }) {
  const base = `/routes/${encodeURIComponent(route)}`;
  return (
    <div className="row wrap" style={{ gap: 6, marginBottom: 16 }}>
      <Link className={`btn sm ${active === "experiment" ? "primary" : ""}`} href={base}>
        Models &amp; experiment
      </Link>
      <Link className={`btn sm ${active === "results" ? "primary" : ""}`} href={`${base}/evals`}>
        Eval results
      </Link>
      <Link className="btn sm" href={`/golden-sets/${encodeURIComponent(route)}`}>
        Golden set
      </Link>
      <Link className="btn sm" href="/drift">
        Drift
      </Link>
      <Link className="btn sm" href="/approvals">
        Approvals
      </Link>
    </div>
  );
}
