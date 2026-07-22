# Handoff.MD — Blindspot
> last-synced: 72c081f + feature-complete release-QA worktree
> Continue with: **Refer to Handoff.MD in `/Users/anandpareek/Documents/Projects/blindspot` and begin**

## Shipped and live
- ✅ Render gateway/dashboard are live on the pre-signup release; GSTPilot remains connected in metadata + observe-only mode.
- ✅ Existing hosted auth fix: GET/prefetch logout is harmless, one session opens all nine tabs.
- ✅ GSTPilot production trace proof: workflow/nodes discovered with Haiku and zero ingest errors.

## Release ready locally
- ✅ Signed beta signup: expiring recipient/project fragment invite, atomic metadata-only project, separate hash-only recovery/application keys and five-minute lost-response replay.
- ✅ One-click UI signs in, shows keys once, requires save acknowledgement, then hands off to guided Connect; no prompt/output capture, provider spend or managed routing is enabled.
- ✅ Playwright found and fixed explicit logout 403: opaque-origin browser forms are accepted only with same-origin navigation metadata; cross-site opaque POST remains rejected.
- ✅ Origin policy now has a zero-token regression; signup/link/session flow and architecture docs are current.

## Verification
- `pnpm typecheck` — 8/8 pass.
- `pnpm test:eval-plan` — pass; signup tamper/expiry/hash-only/retry/concurrency + logout-origin policy; provider token cost 0.
- `pnpm build` — pass; Next generated 10/10 static pages.
- Playwright production build — invite → create → save gate → Connect; all nine tabs 200; refresh persists; GET logout 405; forged logout 403; POST logout 307 clears cookie; protected route returns to login; zero console warnings/errors.
- Mermaid — 9/9 deep parse; standalone viewer rebuilt.

## FMEA at `72c081f` + release worktree
**Outcome:** 0 P0; 12/12 categories checked. Loop remains off; no paid eval ran.

| Remaining | Priority | Follow-up |
|---|---|---|
| All bearer keys still have project-admin power. | P1 | Scoped/expiring human vs app keys before broad beta. |
| Signup link is bearer-only; no email ownership challenge. | P1 | Secure delivery now; verified identity before open signup. |
| No public rate limits, Sentry/OTel alerts or automatic thresholds. | P1 | Phase 8 before production traffic. |
| SDK delivery is best-effort; inline paid evals lack crash recovery. | P1 | BullMQ retry/resume + DLQ and telemetry alerts. |

## Next
1. Commit/push this release, wait for both Render services, then run hosted health/signup/security smoke without creating a production QA workspace.
2. Issue links to 2–3 trusted TypeScript teams with [`docs/BETA_ONBOARDING.md`](./docs/BETA_ONBOARDING.md); collect native feedback.
3. Build scoped/expiring keys + verified identity, publish the SDK, then add native Python observability.
4. Phase 8: Redis workers, durable telemetry, rate limits, OTel/Sentry and k6.
