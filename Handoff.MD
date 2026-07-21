# Handoff.MD — Blindspot
> last-synced: 1a4880b + current truthful-evidence working tree
> Continue with: **Refer to Handoff.MD in `/Users/anandpareek/Documents/Projects/blindspot` and begin**

## Current state
- ✅ Lowercase `/Documents/Projects/blindspot` is now the canonical repo; branch `main` includes the
  newer `Blindspot_v1` history. Backup branch: `codex/pre-v1-sync-20260721`; the pre-sync stash remains.
- ✅ Workflows show agent/generation/retrieval/tool/function nodes; Routes & Models shows only model
  generation nodes. Observe-only and managed routing are explicit and use the observed/app-approved
  model as their respective source of truth.
- ✅ Golden Sets has source → configure → review/publish → run steps; CSV/JSON/JSONL structured upload,
  Markdown/text context, explicit shared-manifest consent, live-trace consent, CRUD/versioning and
  trace promotion are present.
- ✅ Eval plans fix `model_only` vs `workflow_replay`. Results have Label, user/task Input, Expected,
  LLM output, equal-weight criterion-mean Score/formula and Issues. Model-only is screening and cannot
  create a production Recommendation; protected workflow replay is required.
- ✅ Drift simulation is quarantined. Comparable same-sample workflow-replay scores can create real
  golden-eval drift. Operational telemetry is collected, but automatic operational thresholds and
  consented live semantic scheduling remain Phase 8.
- ✅ Approval is truthful: managed = approve/apply; observe-only = approve/awaiting rollout. Overview
  does not count screening as live quality or awaiting rollout as realized savings.
- ✅ Gateway keys now support race-safe revoke with final-key lockout protection. The exposed local
  GSTPilot project key was replaced, verified and revoked without printing its replacement.
- ✅ SDK builds to a publishable tarball shape; Render Blueprint uses two free Singapore web services,
  inline eval mode and no Redis for this prototype.

## Verification
- `pnpm typecheck` — 8/8 packages pass.
- `pnpm test:eval-plan` — zero provider tokens; passes spend authorization, criteria score,
  model-only drift isolation, simulation quarantine, observe-only rollout and concurrency regressions.
- `pnpm build` — dashboard production build passes, including `/routes/[name]/evals` and favicon.
- Mermaid — 9/9 parse; `docs/architecture-flow.html` rebuilt.
- Local HTTP — gateway `/healthz` and dashboard evidence/golden/drift/approval/settings pages return 200;
  visible assertions pass, simulator is hidden.

## FMEA — feature-complete scan at `1a4880b` + working tree
**Scope:** truthful eval UX, workflow replay, drift, keys, uploads, SDK packaging and Render config.
**Outcome:** 0 P0. Fixed during scan: response streaming/2MB cap + DNS pinning, model-only/incomparable
drift, screening-as-live-quality, observe-only savings, concurrent final-key deletion, oversized request
bodies, and duplicate Recommendation race.

| Remaining | Priority | Action |
|---|---|---|
| Inline sequential evals can outlive an HTTP request and have no crash recovery after paid calls. | P1 | Phase 8: BullMQ handoff, idempotent resume, DLQ and plan-aware worker. Keep first hosted test to 1–2 examples. |
| No per-project rate limit, OTel/Sentry alerting or automatic operational-drift thresholds yet. | P1 | Phase 8 before multi-tenant production traffic. |
| Live semantic drift needs full capture plus explicit judge budget/schedule. | P1 | Build consented sampler; never judge metadata-only traffic. |
| GSTPilot’s committed local connector still uses a sibling SDK link and has no protected replay callback. | P1 | Separate GSTPilot-repo change is required before hosted workflow replay; do not set managed/replay envs until that code is deployed. |
| Replay DNS lookup itself relies on the OS resolver timeout; callback failures are visible per example but not alerted externally. | P2 | Add resolver timeout metric + Sentry in Phase 8. |

**Coverage:** 12/12 categories checked: unhandled errors, external dependencies, races/state, resource
exhaustion, security/access control, partial writes, observability, scale/load, billing mismatch,
retry/idempotency, config drift and PRD edge cases.

## Next
- 🤖 Commit and push the truthful-evidence checkpoint, then create `blindspot-gateway` and
  `blindspot-dashboard` on Render with the existing database/encryption values and verify live `/healthz`.
- 🤖 After deployment, update this handoff with service IDs/URLs and the exact GSTPilot env checklist.
- 🧑 USER: for the first paid hosted eval, choose the route, golden version, Sonnet/Haiku, 1–2 examples,
  displayed budget and capture mode. Paid provider evals remain ask-only; Loop remains off.
- 🤖 Separate next checkpoint: implement/push GSTPilot’s distributable SDK dependency, managed resolver
  at its shared model-call wrapper and authenticated replay endpoint, then configure the workflow callback.
- 🤖 Phase 8: Redis worker durability, rate limits, pricing freshness, OTel/Sentry and k6.

## Run locally
Blindspot: `pnpm start:gateway` (:8787) · `pnpm start:dashboard` (:3001) · verify with
`pnpm typecheck && pnpm test:eval-plan && pnpm build`.

GSTPilot (:3000):
`NODE_EXTRA_CA_CERTS='/Users/anandpareek/Documents/SEO content Skill/scripts/system-ca-bundle.pem' pnpm dev`
(run from `/Users/anandpareek/Documents/gstpilot`).
