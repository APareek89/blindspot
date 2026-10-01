"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Eye, LogOut, Moon, Sun } from "lucide-react";
import { AccountEpoch, readOwned, runOwnedAction } from "@/lib/client-epoch";

type User = { id: string; email: string };
type Session = { user: User | null; csrf: string | null; mode: "mock" | "live" };
type Account = { session: Session | null; loading: boolean; error: string | null; epoch: AccountEpoch; refresh: () => Promise<Session | null>; invalidate: () => void };
const Context = createContext<Account | null>(null);
const Owner = createContext<string | null>(null);
export function useAccount() { const value = useContext(Context); if (!value) throw new Error("Account provider missing"); return value; }

export async function authForm(action: "callback/credentials" | "signout", fields: Record<string, string> = {}, current: () => boolean = () => true) {
  const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
  const csrf = await csrfResponse.json();
  if (!current()) return;
  if (!csrfResponse.ok || typeof csrf.csrfToken !== "string") throw new Error("Account service is unavailable. Please try again.");
  const response = await fetch(`/api/auth/${action}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" }, body: new URLSearchParams({ ...fields, csrfToken: csrf.csrfToken, callbackUrl: window.location.origin }) });
  const data = await response.json().catch(() => null);
  if (!current()) return;
  if (!response.ok || typeof data?.url !== "string") throw new Error("Account request was not completed. Please try again.");
  const result = new URL(data.url, window.location.origin);
  if (result.searchParams.has("error")) throw new Error("Email or password was not accepted.");
}

export function AccountShell({ children }: { children: React.ReactNode }) {
  const epoch = useRef(new AccountEpoch()).current;
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const router = useRouter();
  const serial = useRef(0);
  const invalidate = useCallback(() => { serial.current++; epoch.accept(null, true); setSession(null); setLoading(true); }, [epoch]);
  const refresh = useCallback(async () => {
    const request = ++serial.current;
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const next = await response.json();
      if (request !== serial.current) return null;
      if (!response.ok || typeof next.csrf !== "string" || (next.user && typeof next.user.id !== "string")) throw new Error();
      epoch.accept(next.user?.id ?? null); setSession(next); setError(null); setLoading(false);
      return next as Session;
    } catch {
      if (request === serial.current) { epoch.accept(null, true); setSession(null); setError("Account service is unavailable. Your workspace is hidden until the connection returns."); setLoading(false); }
      return null;
    }
  }, [epoch]);
  useEffect(() => {
    void refresh();
    const focus = () => { void refresh(); };
    const changed = (event: StorageEvent) => { if (event.key === "blindspot-account-change") { invalidate(); void refresh().then(() => router.refresh()); } };
    window.addEventListener("focus", focus); window.addEventListener("storage", changed);
    try { const next = localStorage.getItem("blindspot-theme") === "dark"; setDark(next); document.documentElement.dataset.theme = next ? "dark" : "light"; } catch {}
    return () => { serial.current++; window.removeEventListener("focus", focus); window.removeEventListener("storage", changed); };
  }, [refresh, invalidate, router]);
  const toggle = () => { const next = !dark; setDark(next); document.documentElement.dataset.theme = next ? "dark" : "light"; try { localStorage.setItem("blindspot-theme", next ? "dark" : "light"); } catch {} };
  const signout = async () => {
    invalidate();
    const ticket = epoch.capture();
    try { await authForm("signout", {}, () => epoch.current(ticket)); if (!epoch.current(ticket)) return; try { localStorage.setItem("blindspot-account-change", String(Date.now())); } catch {} window.location.replace("/login"); }
    catch { if (epoch.current(ticket)) { setError("Sign out was not completed. Please retry."); setLoading(false); } }
  };
  return <Context.Provider value={{ session, loading, error, epoch, refresh, invalidate }}>
    <header className="app-header"><Link href="/" className="app-brand"><Eye size={21} aria-hidden="true" />Blindspot <span>Agent observability</span></Link>
      <div className="row"><button className="btn icon" onClick={toggle} aria-label={`Switch to ${dark ? "light" : "dark"} theme`}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        {session?.user ? <><span className="account-email" title={session.user.email}>{session.user.email}</span><button className="btn" onClick={() => void signout()}><LogOut size={15} />Sign out</button></> : <Link className="btn" href="/login">Sign in</Link>}
      </div>
    </header>
    {error && <div className="account-error alert danger" role="alert">{error} <button className="btn sm" onClick={() => void refresh()}>Retry connection</button></div>}
    {children}
  </Context.Provider>;
}

export function WorkspaceBoundary({ ownerId, children }: { ownerId: string; children: React.ReactNode }) {
  const account = useAccount();
  const router = useRouter();
  const matches = !account.loading && account.session?.user?.id === ownerId;
  useEffect(() => { if (!account.loading && !account.error && !matches) { router.replace(account.session?.user ? "/" : "/login"); router.refresh(); } }, [account.loading, account.error, account.session?.user, matches, router]);
  return matches ? <Owner.Provider key={`${ownerId}:${account.epoch.generation}`} value={ownerId}>{children}</Owner.Provider> : <div className="account-wait" role="status">{account.error ? "Workspace unavailable" : "Checking your account…"}</div>;
}

export function useOwnerGuard() {
  const account = useAccount();
  const ownerId = useContext(Owner);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const capture = () => account.epoch.capture();
  const current = (ticket: ReturnType<AccountEpoch["capture"]>) => mounted.current && ticket.owner === ownerId && account.epoch.current(ticket);
  async function run<T extends { ok: boolean; code?: string; error?: string }>(fn: (owner: string) => Promise<T>): Promise<T | { ok: false; error: string } | null> {
    return runOwnedAction(account.epoch, ownerId, () => mounted.current, fn, () => { account.invalidate(); void account.refresh(); });
  }
  const read = <T,>(fn: () => Promise<T>) => readOwned(account.epoch, ownerId, () => mounted.current, fn);
  return { ownerId, capture, current, run, read };
}
