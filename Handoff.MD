# Handoff.MD — Blindspot
> last-synced: 80e4a00
> Continue with: **Refer to Handoff.MD in `/Users/anandpareek/Documents/Projects/blindspot` and begin**

## Current state
- ✅ Canonical repo is `/Documents/Projects/blindspot` on `main`; Render gateway/dashboard deploy from
  `APareek89/blindspot`. GSTPilot is `/Documents/gstpilot` on `master`.
- ✅ Truthful-evidence flow is built: all workflow node kinds vs model-only Routes, consented/versioned
  golden sets, disclosed model-only vs workflow-replay evals, visible per-example scoring, real drift
  lanes and approval-gated application state.
- ✅ GSTPilot commits `02f8c81` + `4b11365` are pushed. Its SDK is a vendored 0.1.0 artifact rather
  than a non-deployable sibling link; Render has five metadata/observe-only Blindspot variables and a
  corrected pnpm build command. Hosted GSTPilot is live at `4b11365`.
- 🟡 The first hosted GSTPilot smoke answered two questions, but child telemetry returned 500 because
  the execution conflict update was empty. The root-only trace proved the bug; the fix is deployed and
  must now pass a fresh hosted multi-node smoke.
- ✅ Invite-only beta is local: atomic isolated project/key CLI, versioned public SDK artifact, recent
  connection confirmation, private in-product feedback, onboarding guide and consent-safe defaults.
- ✅ `blindspot.beta_feedback` was added non-destructively to the configured Postgres database. Feedback
  is authenticated/project-scoped, bounded, explicit, rejects obvious credentials and attaches no logs.

## Verification at this checkpoint
- `pnpm typecheck` — 8/8 pass.
- `pnpm test:eval-plan` — pass, zero provider tokens; includes invite/raw-key, feedback isolation,
  SDK request boundary and root+ordinary-child persistence regressions.
- `pnpm build` — pass; `/connect` and `/feedback` compile.
- Mermaid — 9/9 structural parse; `docs/architecture-flow.html` rebuilt.
- SDK artifact SHA-256 matches `docs/BETA_ONBOARDING.md`; GSTPilot clean-checkout production build passed.
- Render gateway/dashboard are live at `80e4a00`; public SDK/login/health pass. The first feedback URL
  probe returned 404 although the same committed route passed locally, so a versioned health feature
  marker plus clean redeploy is the active verification step.

## FMEA — feature-complete scan at `ade11e4` + working tree
**Outcome:** 0 P0. The scan found the private-GitHub feedback path would block external testers, so it
was replaced before release with project-scoped native feedback.

| Remaining failure mode | Priority | Concrete follow-up |
|---|---|---|
| All beta bearer keys currently have project-admin power; secure delivery/revocation is procedural. | P1 | Add scoped/expiring human vs app keys before a broad beta; invite only trusted testers now. |
| SDK telemetry is best-effort with one retry; prolonged gateway failure can drop spans. | P1 | Phase 8 durable spool/queue, metrics and external alerts. |
| Inline sequential paid evals lack crash recovery after a provider call. | P1 | Phase 8 BullMQ idempotent resume + DLQ; keep hosted tests to 1–2 examples. |
| No per-project rate limit, Sentry/OTel alerting or automatic operational thresholds. | P1 | Complete Phase 8 before production traffic. |
| Concurrent identical operator invites can race the application-level duplicate check. | P2 | Add a DB uniqueness constraint or serializable retry before self-serve signup. |
| Beta SDK tarball is checksum-pinned but not registry-signed/automatically upgraded. | P2 | Publish `@blindspot/sdk` to npm with provenance before GA. |

**Coverage:** 12/12 categories: errors, dependencies, races, resources, security, partial writes,
observability, scale, billing, retry/idempotency, config drift and PRD edges.

## Next
1. Push the CLI-exit/health-marker checkpoint, wait for Render, verify health + feedback endpoint.
2. Send one harmless hosted GSTPilot question; prove the production execution contains root and child
   generation/function nodes, not merely a successful app response.
3. Update this handoff and `docs/RENDER_DEPLOYMENT.md` with the verified commit, then final checkpoint.
4. Managed routing and protected replay remain OFF for GSTPilot until every model boundary supports
   temporary overrides. Loop remains off; paid evals remain ask-only.

## Local commands
`pnpm start:gateway` (:8787) · `pnpm start:dashboard` (:3001) ·
`pnpm typecheck && pnpm test:eval-plan && pnpm build`
