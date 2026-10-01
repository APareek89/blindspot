"use client";
import { useState, useTransition } from "react";
import { useOwnerGuard } from "./AccountShell";
type Result = { ok: boolean; error?: string; code?: string };
export function OwnedForm({ action, children, disabled = false, ...props }: { action: (data: FormData, ownerId: string) => Promise<Result>; children: React.ReactNode; disabled?: boolean } & Omit<React.FormHTMLAttributes<HTMLFormElement>, "action">) {
  const guard = useOwnerGuard(); const [error, setError] = useState<string | null>(null); const [pending, start] = useTransition();
  return <form {...props} onSubmit={event => { event.preventDefault(); if (disabled) return; const data = new FormData(event.currentTarget); setError(null); start(async () => { const ticket = guard.capture(); const result = await guard.run(owner => action(data, owner)); if (result && guard.current(ticket) && !result.ok) setError(result.error ?? "Request failed."); }); }} aria-busy={pending}>
    <fieldset className="owned-fieldset" disabled={pending || disabled}>{children}</fieldset>{error && <div className="alert danger" role="alert">{error}</div>}
  </form>;
}
