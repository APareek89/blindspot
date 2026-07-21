# Handoff.MD — Blindspot
> last-synced: a212301
> Continue with: **Refer to Handoff.MD in `/Users/anandpareek/Documents/Projects/blindspot` and begin**

## Shipped and live
- ✅ Blindspot gateway/dashboard are live on Render at `49ed683`; GSTPilot is live at `4b11365`.
- ✅ GSTPilot is self-contained: vendored SDK 0.1.0, frozen pnpm build and five metadata/observe-only Render variables; no sibling checkout.
- ✅ Hosted GSTPilot smoke passed: T1 response; production moved 1→2 executions and 1→3 nodes (`pipeline`, `intake`, `fill-slots:registration_threshold`), with Haiku identified and zero ingest errors.
- ✅ Child-span bug fixed: conflict updates are non-empty and cannot reopen a completed root; zero-token regression covers root + ordinary child.
- ✅ Invite beta: versioned SDK, connection proof, safe native feedback and operator review; signup-link flow is locally complete and awaits deploy.
- ✅ Browser session fix is live: prefetched GET logout is harmless; only explicit same-origin POST signs out; all nine destinations retain one session.

## Verification
- `pnpm typecheck` — 8/8 pass.
- `pnpm test:eval-plan` — pass, zero provider tokens; signed signup tamper/expiry/hash-only/retry/concurrency plus existing regressions pass.
- `pnpm build` — signup build passed before final headers; final rerun compiled/typechecked then was user-paused during static generation. Rerun before deploy.
- Mermaid — 9/9 structural parse; HTML viewer rebuilt.
- Hosted — health/features, feedback, login and SDK pass; GSTPilot project key returns `/v1/me` 200 and is sourced from GSTPilot, not Blindspot `.env`.
- Hosted auth — login 303; prefetch-style GET logout 405; all nine destinations 200; explicit POST logout 307 then protected route 307. User confirmation remains.

## FMEA at `a212301` + signup worktree
**Outcome:** 0 P0. Fixed during scan: logged query token design, partial shown-once delivery,
unbounded key replay, concurrent project race, Postgres NUL lock key, cold-create timeout and browser headers.

| Remaining | Priority | Follow-up |
|---|---|---|
| All bearer keys have project-admin power; delivery/revocation is procedural. | P1 | Scoped/expiring human vs app keys before broad beta. |
| SDK is best-effort with one retry; outage can drop spans. | P1 | Phase 8 durable queue, metrics, alerts. |
| Inline paid evals lack crash recovery. | P1 | BullMQ idempotent resume + DLQ; test only 1–2 examples. |
| No rate limits, Sentry/OTel alerts or automatic operational thresholds. | P1 | Complete before production traffic. |
| Signup link is a bearer credential; no email ownership challenge yet. | P1 | Use secure delivery; add verified identity before open signup. |

**Coverage:** 12/12 categories checked. Loop is off; paid evals remain ask-only.

## Next
1. Deploy and issue recipient/project-bound links to 2–3 trusted TypeScript teams using [`docs/BETA_ONBOARDING.md`](./docs/BETA_ONBOARDING.md).
2. Add scoped/expiring admin vs application keys, then npm-publish the SDK.
3. Add a native Python observability SDK; keep Python users on the gateway until then.
4. Phase 8: Redis workers, durable telemetry, rate limits, OTel/Sentry and k6.
