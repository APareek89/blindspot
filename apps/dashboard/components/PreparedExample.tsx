"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FlaskConical, ArrowRight } from "lucide-react";
import { createExampleA } from "@/app/(app)/examples/actions";
import { useOwnerGuard } from "./AccountShell";
export function PreparedExample() {
  const guard = useOwnerGuard(); const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState<string | null>(null);
  return <section className="card onboarding"><div><span className="badge neutral"><FlaskConical size={13} />Prepared example · Free</span><h2>Follow an agent from execution to evidence.</h2><p className="muted">Explore observed nodes, evaluation results and cost reporting with prepared responses. No provider calls.</p></div>
    <div className="stack"><button className="btn primary" disabled={pending} aria-busy={pending} onClick={() => { setError(null); start(async () => { const ticket = guard.capture(); const result = await guard.run(owner => createExampleA(owner)); if (!result || !guard.current(ticket)) return; if (!result.ok) setError(result.error ?? "Example could not be prepared."); else { router.push(`/routes/${encodeURIComponent(result.routeName)}`); router.refresh(); } }); }}>{pending ? "Preparing example…" : "Try with an example"}<ArrowRight size={16} /></button><Link href="/connect" className="btn">Connect your agent</Link></div>
    {error && <div className="alert danger" role="alert">{error}</div>}
  </section>;
}
