"use client";
import Link from "next/link";
import { useState } from "react";
import { Eye, ShieldCheck } from "lucide-react";
import { authForm, useAccount } from "./AccountShell";

export function AuthForm({ signup = false }: { signup?: boolean }) {
  const account = useAccount();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    const ticket = account.epoch.capture();
    try {
      if (signup) {
        if (password.length < 12 || new TextEncoder().encode(password).length > 72) throw new Error("Use at least 12 characters and no more than 72 bytes for your password.");
        const session = account.session ?? await account.refresh();
        if (!account.epoch.current(ticket)) return;
        if (!session?.csrf) throw new Error("Account service is unavailable. Please retry.");
        const response = await fetch("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, csrf: session.csrf }) });
        const result = await response.json().catch(() => null);
        if (!account.epoch.current(ticket)) return;
        if (!response.ok) throw new Error(result?.code === "account_exists" || response.status === 409 ? "An account already exists. Sign in to continue." : response.status === 429 ? "Too many account requests. Please wait and try again." : "Account could not be created. Check your details and try again.");
      }
      if (!account.epoch.current(ticket)) return;
      await authForm("callback/credentials", { email, password }, () => account.epoch.current(ticket));
      if (!account.epoch.current(ticket)) return;
      account.invalidate();
      const next = await account.refresh();
      if (!next?.user) throw new Error("Sign in was not completed. Please try again.");
      setPassword(""); try { localStorage.setItem("blindspot-account-change", String(Date.now())); } catch {}
      window.location.replace("/");
    } catch (e) { setError(e instanceof Error ? e.message : "Account request failed."); }
    finally { setBusy(false); }
  }
  return <main className="auth-layout">
    <section className="auth-aside"><Eye size={32} /><span className="eyebrow">BLINDSPOT</span><h1>See the work your agents actually do.</h1><p>Inspect observed workflows, compare model quality and cost, and review changes before applying them.</p><div className="row small"><ShieldCheck size={18} />Your own workspace. Approval gates stay in your control.</div></section>
    <section className="auth-panel"><h2>{signup ? "Create your account" : "Welcome back"}</h2><p className="muted">{signup ? "Start with a prepared, free example or connect an agent." : "Sign in to your Blindspot workspace."}</p>
      <form onSubmit={submit} className="stack"><div className="field"><label className="label" htmlFor="account-email">Email</label><input id="account-email" className="input" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} /></div>
      <div className="field"><label className="label" htmlFor="account-password">Password</label><input id="account-password" className="input" type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 12 : undefined} value={password} onChange={e => setPassword(e.target.value)} />{signup && <p className="muted small">At least 12 characters. Password recovery is not available yet.</p>}</div>
      {error && <div className="alert danger" role="alert">{error}</div>}<button className="btn primary" disabled={busy || account.loading} aria-busy={busy}>{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}</button>
      <button className="btn" type="button" disabled>Google · Not configured</button></form>
      <p className="small">{signup ? "Already have an account? " : "New to Blindspot? "}<Link className="text-link" href={signup ? "/login" : "/signup"}>{signup ? "Sign in" : "Create an account"}</Link></p>
    </section>
  </main>;
}
