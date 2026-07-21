"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy } from "@/components/Copy";

type Invite = { owner: string; project: string; expiresAt: string };
type Created = { project: { name: string; owner: string }; recoveryKey: string; applicationKey: string };

function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return fallback;
}

export function SignupFlow() {
  const [inviteToken, setInviteToken] = useState("");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "creating" | "error">("loading");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("invite") ?? "";
    if (!token) {
      setError("This signup link is incomplete. Ask your Blindspot contact for a fresh invitation.");
      setStatus("error");
      return;
    }
    setInviteToken(token);
    void (async () => {
      try {
        const response = await fetch("/signup/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ inviteToken: token }),
        });
        const body = (await response.json().catch(() => ({}))) as { invite?: Invite; error?: string };
        if (!response.ok || !body.invite) throw new Error(messageFrom(body, "This invitation could not be verified."));
        setInvite(body.invite);
        setStatus("ready");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "This invitation could not be verified.");
        setStatus("error");
      }
    })();
  }, []);

  const environment = useMemo(
    () =>
      created
        ? `BLINDSPOT_API_KEY=${created.applicationKey}\nBLINDSPOT_BASE_URL=https://blindspot-gateway.onrender.com\nBLINDSPOT_ENVIRONMENT=production\nBLINDSPOT_CAPTURE=metadata\nBLINDSPOT_ROUTING=observe_only`
        : "",
    [created],
  );

  async function createWorkspace() {
    if (!inviteToken || status === "creating") return;
    setStatus("creating");
    setError("");
    try {
      const response = await fetch("/signup/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteToken }),
      });
      const body = (await response.json().catch(() => ({}))) as Created & { error?: string };
      if (!response.ok || !body.recoveryKey || !body.applicationKey) {
        throw new Error(messageFrom(body, "Workspace creation failed."));
      }
      window.history.replaceState(null, "", "/signup");
      setInviteToken("");
      setCreated(body);
      setStatus("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Workspace creation failed.");
      setStatus("ready");
    }
  }

  return (
    <div className="signup-wrap">
      <div className="signup-card">
        <div className="brand">
          <span className="dot" />
          Blindspot
        </div>

        <div className="signup-steps" aria-label="Signup progress">
          <span className={!created ? "active" : "done"}>1 · Workspace</span>
          <span className={created ? "active" : ""}>2 · Save keys</span>
          <span>3 · Connect SDK</span>
        </div>

        {status === "loading" && (
          <div className="signup-state">
            <div className="signup-spinner" />
            <h1>Checking your invitation</h1>
            <p className="muted">This usually takes a few seconds.</p>
          </div>
        )}

        {status === "error" && !created && (
          <div className="signup-state">
            <div className="signup-mark danger">!</div>
            <h1>Invitation unavailable</h1>
            <p className="muted">{error}</p>
            <a className="btn" href="/login">Sign in instead</a>
          </div>
        )}

        {invite && !created && status !== "loading" && status !== "error" && (
          <>
            <div className="signup-head">
              <span className="badge accent">Private beta</span>
              <h1>Create your Blindspot workspace</h1>
              <p>
                Start in metadata-only, observe-only mode. No prompts, outputs, provider spend, or
                model changes are enabled by signup.
              </p>
            </div>

            <div className="grid cols-2" style={{ marginBottom: 16 }}>
              <div className="card">
                <div className="label">Project</div>
                <div style={{ fontWeight: 600 }}>{invite.project}</div>
              </div>
              <div className="card">
                <div className="label">Owner</div>
                <div className="mono">{invite.owner}</div>
              </div>
            </div>

            <div className="alert info" style={{ marginBottom: 16 }}>
              Your invite expires {new Date(invite.expiresAt).toLocaleString()}. Creating the workspace
              signs you in and generates separate recovery and application keys.
            </div>
            {error && <div className="alert danger" style={{ marginBottom: 16 }}>{error}</div>}
            <button className="btn primary signup-primary" onClick={createWorkspace} disabled={status === "creating"}>
              {status === "creating" ? "Creating secure workspace…" : "Create workspace"}
            </button>
            <p className="hint" style={{ textAlign: "center" }}>
              By continuing, you confirm this is your project and you are authorized to connect it.
            </p>
          </>
        )}

        {created && (
          <>
            <div className="signup-head">
              <span className="badge pass">Workspace ready</span>
              <h1>Save these two keys now</h1>
              <p>
                They are shown only on this screen. You are already signed in with the recovery key.
              </p>
            </div>

            <div className="alert warn" style={{ marginBottom: 14 }}>
              Do not put the recovery key in your application. Store it in your password manager for
              dashboard access and recovery.
            </div>
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="row between" style={{ marginBottom: 10 }}>
                <div>
                  <div className="card-title">Recovery key</div>
                  <div className="hint">Human dashboard access · keep private</div>
                </div>
                <Copy text={created.recoveryKey} label="Copy recovery key" />
              </div>
              <pre className="code signup-secret">{created.recoveryKey}</pre>
            </div>

            <div className="card" style={{ marginBottom: 14 }}>
              <div className="row between" style={{ marginBottom: 10 }}>
                <div>
                  <div className="card-title">Application environment</div>
                  <div className="hint">Server-side app key · metadata + observe-only defaults</div>
                </div>
                <Copy text={environment} label="Copy environment" />
              </div>
              <pre className="code signup-secret">{environment}</pre>
            </div>

            <div className="grid cols-2" style={{ marginBottom: 14 }}>
              <div className="card">
                <div className="card-title" style={{ marginBottom: 10 }}>1. Install</div>
                <pre className="code">pnpm add https://blindspot-dashboard.onrender.com/blindspot-sdk-0.1.0.tgz</pre>
              </div>
              <div className="card">
                <div className="card-title" style={{ marginBottom: 10 }}>2. Instrument</div>
                <p className="muted small">
                  Wrap the shared helper that makes your model calls, then flush once at the request
                  boundary. The next screen gives exact code.
                </p>
              </div>
            </div>

            <label className="signup-confirm">
              <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
              <span>I saved the recovery key and copied the application environment.</span>
            </label>
            <button
              className="btn primary signup-primary"
              disabled={!saved}
              onClick={() => window.location.assign("/connect?welcome=1")}
            >
              Continue to SDK connection →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
