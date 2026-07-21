const ERRORS: Record<string, string> = {
  shape: "That doesn't look like a complete project key. Paste only the full bs_live_… value.",
  invalid: "That project key wasn't recognized by the hosted gateway.",
  gateway: "The gateway is waking up or temporarily unavailable. Wait a few seconds and retry.",
  failed: "Sign-in failed. Please try again.",
};

function safeNext(value: string | undefined): string {
  return value && /^\/(?!\/)[^\\\r\n]*$/.test(value) ? value : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? ERRORS[params.error] ?? ERRORS.failed : null;
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand">
          <span className="dot" />
          Blindspot
        </div>
        <p className="muted small" style={{ marginBottom: 20 }}>
          The eval-gated model &amp; cost layer for your AI agents. Sign in once with the complete
          project key included in your Blindspot beta invite.
        </p>
        <form action="/login/session" method="post">
          <input type="hidden" name="next" value={safeNext(params.next)} />
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
              pattern="bs_live_[a-fA-F0-9]{48}"
              minLength={56}
              maxLength={56}
              required
              autoFocus
            />
            <div className="hint">
              Paste only the full 56-character value. One secure cookie keeps every dashboard tab signed in for 30 days.
            </div>
          </div>
          {error && (
            <div className="alert danger" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}
          <button className="btn primary" style={{ width: "100%" }}>
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
