import { FlaskConical } from "lucide-react";
import Link from "next/link";
/** Only server-authored provenance marks prepared records; names/models are never inferred. */
export function isPrepared(value: unknown): boolean {
  return typeof value === "object" && value !== null && "exampleKind" in value && value.exampleKind === "prepared";
}
export function PreparedBadge({ record }: { record: unknown }) {
  return isPrepared(record) ? <span className="badge neutral"><FlaskConical size={12} aria-hidden="true" />Prepared · Illustrative</span> : null;
}
export function PreparedNotice() {
  return <div className="alert info" style={{ marginBottom: 16 }}><strong>Prepared example · No provider calls.</strong> Responses, scores (including 90%) and cost values are illustrative fixtures. They are not production-quality measurements or paid model comparisons. <span style={{ display: "block", marginTop: 6 }}>Read-only example. <Link href="/connect">Connect your agent</Link> to run your own experiments.</span></div>;
}
