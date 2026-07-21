"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(signIn, null);

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand">
          <span className="dot" />
          Blindspot
        </div>
        <p className="muted small" style={{ marginBottom: 20 }}>
          The eval-gated model &amp; cost layer for your AI agents. Sign in with the shown-once
          project key included in your Blindspot beta invite.
        </p>
        <form action={action}>
          <div className="field">
            <label className="label" htmlFor="key">
              Project key
            </label>
            <input
              id="key"
              name="key"
              type="password"
              className="input mono"
              placeholder="bs_live_…"
              autoComplete="off"
              autoFocus
            />
            <div className="hint">
              Held in an httpOnly cookie. After sign-in, mint a separate application key in Settings.
            </div>
          </div>
          {error && (
            <div className="alert danger" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}
          <button className="btn primary" style={{ width: "100%" }} disabled={pending}>
            {pending ? "Checking…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
