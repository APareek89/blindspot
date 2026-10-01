"use client";

import { useOwnerGuard } from "@/components/AccountShell";

import { useState, useTransition } from "react";
import { Copy } from "@/components/Copy";
import { dateTime } from "@/lib/format";
import {
  PROVIDERS,
  type GatewayKey,
  type ModelRegistryOverview,
  type ProviderKey,
  type Settings,
} from "@/lib/types";
import {
  deleteProviderKeyA,
  mintKeyA,
  revokeKeyA,
  setProviderKeyA,
  syncModelRegistryA,
} from "./actions";

export function SettingsView({
  providerKeys,
  gatewayKeys,
  settings,
  registry,
}: {
  providerKeys: ProviderKey[];
  gatewayKeys: GatewayKey[];
  settings: Settings;
  registry: ModelRegistryOverview;
}) {
  const guard = useOwnerGuard();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("anthropic");
  const [value, setValue] = useState("");
  const [minted, setMinted] = useState<string | null>(null);

  const configured = new Set(providerKeys.map((p) => p.provider));

  const run = (fn: () => Promise<{ ok: boolean; error?: string } | null>, done?: () => void) => {
    setError(null);
    start(async () => {
      const ticket = guard.capture();
      const r = await fn();
      if (!r || !guard.current(ticket)) return;
      if (!r.ok) setError(r.error ?? "failed");
      else done?.();
    });
  };

  return (
    <div className="stack">
      {error && <div className="alert danger">{error}</div>}

      {/* provider keys */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 4 }}>
          Provider keys (BYO)
        </div>
        <div className="card-sub" style={{ marginBottom: 14 }}>
          Encrypted at rest with AES-256-GCM. Values are never displayed or returned — only
          their presence.
        </div>

        {providerKeys.length > 0 && (
          <div className="card pad-0" style={{ marginBottom: 14 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {providerKeys.map((p) => (
                  <tr key={p.provider}>
                    <td style={{ fontWeight: 550 }}>{p.provider}</td>
                    <td className="muted small">{dateTime(p.createdAt)}</td>
                    <td className="num">
                      <button
                        className="btn sm danger-ghost"
                        disabled={pending}
                        onClick={() => run(() => guard.run((ownerId) => deleteProviderKeyA(p.provider, ownerId)))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="row wrap" style={{ gap: 8, alignItems: "flex-end" }}>
          <div>
            <label className="label">Provider</label>
            <select aria-label="Provider" className="select" style={{ width: 150 }} value={provider} onChange={(e) => setProvider(e.target.value)}>
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                  {configured.has(p) ? " ✓" : ""}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 260px" }}>
            <label className="label">API key {configured.has(provider) && "(replaces existing)"}</label>
            <input aria-label="API key"
              className="input mono"
              type="password"
              autoComplete="off"
              placeholder="paste key…"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <button
            className="btn primary"
            disabled={pending || !value.trim()}
            onClick={() => run(() => guard.run((ownerId) => setProviderKeyA(provider, value, ownerId)), () => setValue(""))}
          >
            Save key
          </button>
        </div>
      </div>

      {/* zero-token model discovery */}
      <div className="card">
        <div className="row between wrap" style={{ marginBottom: 4 }}>
          <span className="card-title">Model registry</span>
          <span className="badge cyan">0 inference tokens</span>
        </div>
        <div className="card-sub" style={{ marginBottom: 14 }}>
          Sync the models available to each BYO account. The first prototype exposes only Claude
          Sonnet 4.6 and Haiku 4.5 to experiments; HF and Fireworks remain wired for later.
        </div>
        <div className="card pad-0">
          <table className="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Access</th>
                <th className="num">Available</th>
                <th>Last sync</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {registry.providers.map((item) => (
                <tr key={item.provider}>
                  <td style={{ fontWeight: 550 }}>{item.provider}</td>
                  <td>
                    <span className={`badge ${item.keyConfigured || item.serverConfigured ? "pass" : "warn"}`}>
                      {item.keyConfigured ? "Your key configured" : item.serverConfigured ? "Server configured" : "Needs key"}
                    </span>
                  </td>
                  <td className="num mono">{item.modelCount}</td>
                  <td className="muted small">
                    {item.lastSyncedAt ? dateTime(item.lastSyncedAt) : "Never"}
                  </td>
                  <td className="num">
                    <button
                      className="btn sm"
                      disabled={pending || (!item.keyConfigured && !item.serverConfigured)}
                      onClick={() => run(() => guard.run((ownerId) => syncModelRegistryA(item.provider, ownerId)))}
                    >
                      {pending ? "Syncing…" : "Sync models"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="hint">
          Sync verifies account access and provider-declared capabilities. It does not call a model
          or spend evaluation budget.
        </div>
      </div>

      {/* gateway keys */}
      <div className="card">
        <div className="row between" style={{ marginBottom: 4 }}>
          <span className="card-title">Gateway keys</span>
          <button className="btn sm" disabled={pending} onClick={() => run(async () => {
            const ticket = guard.capture();
            const r = await guard.run((ownerId) => mintKeyA(ownerId));
            if (r?.ok && guard.current(ticket)) setMinted(r.key);
            return r;
          })}>
            Mint new key
          </button>
        </div>
        <div className="card-sub" style={{ marginBottom: 14 }}>
          The <span className="mono">bs_live_</span> keys your apps use as a bearer token. Stored
          only as a hash — a minted key is shown once.
        </div>

        {minted && (
          <div className="alert warn" style={{ marginBottom: 14 }}>
            <div className="row between" style={{ marginBottom: 8 }}><span>Save this now — it won’t be shown again:</span><button className="btn sm" onClick={() => setMinted(null)}>Hide key</button></div>
            <div className="row between" style={{ gap: 8 }}>
              <span className="mono" style={{ wordBreak: "break-all" }}>
                {minted}
              </span>
              <Copy text={minted} />
            </div>
          </div>
        )}

        <div className="card pad-0">
          <table className="table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {gatewayKeys.map((k) => (
                <tr key={k.id}>
                  <td className="mono">{k.prefix}…</td>
                  <td className="muted small">{dateTime(k.createdAt)}</td>
                  <td className="num">
                    <button
                      className="btn sm danger"
                      disabled={pending}
                      title="Revoke this SDK key immediately; your email/password account remains available"
                      onClick={() => {
                        if (window.confirm(`Revoke gateway key ${k.prefix}…? Apps using it will stop connecting immediately.`)) {
                          run(() => guard.run((ownerId) => revokeKeyA(k.id, ownerId)));
                        }
                      }}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* cost + config */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>
          Cost caps &amp; config
        </div>
        <div className="grid cols-2">
          <div className="card">
            <div className="kpi-label">Cost cap / eval run</div>
            <div className="kpi-value" style={{ fontSize: 20 }}>
              {settings.costCapUsdPerEvalRun != null ? `$${settings.costCapUsdPerEvalRun}` : "none"}
            </div>
            <div className="kpi-foot">COST_CAP_USD_PER_EVAL_RUN</div>
          </div>
          <div className="card">
            <div className="kpi-label">Default model</div>
            <div className="mono" style={{ marginTop: 8, fontSize: 13 }}>
              {settings.defaultModel ?? "—"}
            </div>
            <div className="kpi-foot">new routes start here</div>
          </div>
          <div className="card">
            <div className="kpi-label">Judge model</div>
            <div className="mono" style={{ marginTop: 8, fontSize: 13 }}>
              {settings.judgeModel ?? "—"}
            </div>
            <div className="kpi-foot">scores golden sets</div>
          </div>
          <div className="card">
            <div className="kpi-label">Eval execution</div>
            <div className="mono" style={{ marginTop: 8, fontSize: 13 }}>
              {settings.evalMode}
            </div>
            <div className="kpi-foot">
              {settings.evalMode === "inline" ? "Redis bypassed locally" : "BullMQ worker"}
            </div>
          </div>
        </div>
        <div className="hint">These are set in the gateway environment and shown read-only here.</div>
      </div>
    </div>
  );
}
