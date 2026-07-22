# Handoff.MD — Blindspot
> last-synced: fa8b062 + hosted-release handoff worktree
> Continue with: **Refer to Handoff.MD in `/Users/anandpareek/Documents/Projects/blindspot` and begin**

## Shipped and live
- ✅ `fa8b062` is on GitHub `main` and both Render services deployed it.
- ✅ Gateway health advertises `invite-signup-v1`; hosted `/signup` and its security headers are live.
- ✅ Signed beta signup: expiring recipient/project fragment invite, atomic metadata-only project, separate hash-only recovery/application keys and five-minute lost-response replay.
- ✅ One-click UI signs in, shows keys once, requires save acknowledgement and hands off to guided Connect; signup enables no content capture, provider spend or managed routing.
- ✅ GSTPilot production observability remains metadata + observe-only with its prior hosted key for now.

## Verification
- `pnpm typecheck` 8/8; `pnpm test:eval-plan` passes with provider token cost 0; `pnpm build` generated 10/10 pages.
- Mermaid 9/9 deep parse; standalone viewer rebuilt.
- Local Playwright production build: invite → create → save gate → Connect; all nine tabs + refresh; request hardening; POST logout clears cookie; zero console errors/warnings.
- Hosted: signed preview 200 without project creation; tampered preview 401; cross-origin dashboard proxy 403; CSP/referrer/frame/content-type/permissions headers present.
- Hosted Playwright: all nine tabs 200; refresh persisted; real form sent opaque same-origin navigation metadata; logout 307 cleared cookie; protected route redirected; invalid-invite mobile state correct.

## Credential rotation required
- ⚠️ Playwright's failed API-request diagnostic printed GSTPilot's project cookie. Temporary auth files were deleted and the incident is in `Learning.MD`.
- ✅ A replacement project key was minted/verified, saved in `/Users/anandpareek/Documents/gstpilot/.env`, and copied to the macOS clipboard without printing it.
- ⏳ GSTPilot Render still has the old key so production is not broken; the old key must be revoked immediately after Render uses the replacement.
- Blocker: the previously supplied Render API key now returns HTTP 400. Put a fresh `RENDER_API_KEY` in Blindspot's git-ignored `.env`, or paste the current clipboard into GSTPilot Render `BLINDSPOT_API_KEY`, save/deploy, then say **rotation done**.

## FMEA at release
**Outcome:** 0 P0; 12/12 categories checked. Loop remains off; no paid eval ran.

| Remaining | Priority | Follow-up |
|---|---|---|
| All bearer keys still have project-admin power. | P1 | Scoped/expiring human vs app keys before broad beta. |
| Signup link is bearer-only; no email ownership challenge. | P1 | Secure delivery now; verified identity before open signup. |
| No public rate limits, Sentry/OTel alerts or automatic thresholds. | P1 | Phase 8 before production traffic. |
| SDK delivery is best-effort; inline paid evals lack crash recovery. | P1 | BullMQ retry/resume + DLQ and telemetry alerts. |

## Next
1. Complete the Render key swap above; verify GSTPilot `/v1/me`/one trace with the replacement; revoke the exposed key.
2. User runs the beta signup checklist; issue links to 2–3 trusted TypeScript teams using [`docs/BETA_ONBOARDING.md`](./docs/BETA_ONBOARDING.md).
3. Build scoped/expiring keys + verified identity, publish SDK, add Python observability, then Phase 8 durability/rate limits/OTel/Sentry/k6.
