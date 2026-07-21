import Link from "next/link";
import { PageError } from "@/components/PageError";
import { Empty } from "@/components/ui";
import { requireApi } from "@/lib/session";
import { ApprovalsInbox } from "./ApprovalsInbox";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? sp.status! : "pending";

  const client = await requireApi();
  let recs;
  try {
    const res = await client.listRecommendations({ status });
    recs = res.recommendations;
  } catch (e) {
    return <PageError error={e} />;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Approvals</h1>
          <p>
            Every better/cheaper candidate — and every drift — arrives here as an evidence-backed
            recommendation. Managed routes apply only after approval; observe-only routes remain
            marked awaiting rollout until the connected app actually uses the target model.
          </p>
        </div>
      </div>

      <div className="row" style={{ gap: 6, marginBottom: 16 }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/approvals?status=${t.key}`}
            className={`badge ${status === t.key ? "accent" : "neutral"}`}
            style={{ padding: "5px 12px", cursor: "pointer" }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {recs.length === 0 ? (
        <div className="card">
          <Empty emoji="✓" title={`No ${status} recommendations`}>
            <p className="muted small">
              {status === "pending"
                ? "You're all caught up. New recommendations appear when a cheaper candidate passes or drift is detected."
                : `No ${status} recommendations yet.`}
            </p>
          </Empty>
        </div>
      ) : (
        <ApprovalsInbox recommendations={recs} />
      )}
    </>
  );
}
