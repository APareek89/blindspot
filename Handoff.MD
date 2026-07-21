# Handoff.MD — Blindspot
> last-synced: d1de2dd
> Continue with: **Refer to Handoff.MD in `/Users/anandpareek/Documents/Projects/blindspot` and begin**

## Shipped and live
- ✅ Blindspot gateway/dashboard are live on Render at `b2a3bcf`; GSTPilot is live at `4b11365`.
- ✅ GSTPilot is self-contained: vendored SDK 0.1.0, frozen pnpm build and five metadata/observe-only Render variables; no sibling checkout.
- ✅ Hosted GSTPilot smoke passed: T1 response; production moved 1→2 executions and 1→3 nodes (`pipeline`, `intake`, `fill-slots:registration_threshold`), with Haiku identified and zero ingest errors.
- ✅ Child-span bug fixed: conflict updates are non-empty and cannot reopen a completed root; zero-token regression covers root + ordinary child.
- ✅ Invite beta: atomic project/key CLI, versioned SDK, fresh-connection banner, native project feedback, operator review CLI and onboarding guide.
- ✅ Render has additive `beta_feedback`; submission is explicit/bounded, rejects obvious credentials, attaches no logs, and authenticated GET is 200.
- ⏳ Browser session root is live (GET logout 405); shared proxy-aware POST origin fix passes locally and awaits deploy/user proof.

## Verification
- `pnpm typecheck` — 8/8 pass.
- `pnpm test:eval-plan` — pass, zero provider tokens; invite/key, feedback, SDK/ingest, budget/evidence/drift/approval and concurrency regressions pass.
- `pnpm build` — pass; `/connect` and `/feedback` compile.
- Mermaid — 9/9 structural parse; HTML viewer rebuilt.
- Hosted — health/features, feedback, login and SDK pass; GSTPilot project key returns `/v1/me` 200 and is sourced from GSTPilot, not Blindspot `.env`.
- Auth regression — GET logout is 405 and preserves the session; rejected POST preserves it; same-origin POST alone removes it. Browser plugin was unavailable, so user confirmation is required.

## FMEA at `ade11e4` + beta worktree; logout delta at `d1de2dd` + worktree
**Outcome:** 0 P0. Fixed during scan: private-GitHub feedback blocker, obvious credential submission,
operator CLI hang, wrong-target database migration and stale connection confirmation.

| Remaining | Priority | Follow-up |
|---|---|---|
| All bearer keys have project-admin power; delivery/revocation is procedural. | P1 | Scoped/expiring human vs app keys before broad beta. |
| SDK is best-effort with one retry; outage can drop spans. | P1 | Phase 8 durable queue, metrics, alerts. |
| Inline paid evals lack crash recovery. | P1 | BullMQ idempotent resume + DLQ; test only 1–2 examples. |
| No rate limits, Sentry/OTel alerts or automatic operational thresholds. | P1 | Complete before production traffic. |
| Identical concurrent invites can race; SDK tarball is not registry-signed. | P2 | DB uniqueness + npm provenance before self-serve/GA. |

**Coverage:** 12/12 categories checked. Loop is off; paid evals remain ask-only.

## Next
1. Invite 2–3 trusted TypeScript teams using [`docs/BETA_ONBOARDING.md`](./docs/BETA_ONBOARDING.md).
2. Add scoped/expiring admin vs application keys, then npm-publish the SDK.
3. Add a native Python observability SDK; keep Python users on the gateway until then.
4. Phase 8: Redis workers, durable telemetry, rate limits, OTel/Sentry and k6.
