# Handoff.MD — Blindspot
> last-synced: 006c590
> Continue with: **Refer to Handoff.MD in `/Users/anandpareek/Documents/Projects/blindspot` and begin**

## Current checkpoint
- ✅ Fixed project-key sign-in rejecting Chromium's legitimate `Origin: null` HTML form navigation; exact-origin and browser-proven same-origin forms pass, cross-site/missing-origin posts stay 403.
- ✅ Added an actual login-handler regression plus full typecheck, zero-token integration suite and production build; provider token cost stayed 0.
- ✅ Local Playwright captured a real `Origin: null` POST returning 303 to key validation instead of the former raw 403.
- ⏳ Commit/push, wait for Render, then repeat the opaque-origin and cross-site probes against hosted login.

## Shipped and live before this checkpoint
- ✅ `006c590` on `main`: signed private-beta signup, shown-once recovery/application keys, guided Connect, nine-tab session persistence and POST logout.
- ✅ Gateway advertises `invite-signup-v1`; hosted signup/security-header/tamper/cross-origin acceptance previously passed.
- ✅ GSTPilot production remains metadata + observe-only with its prior hosted key for now.

## Credential rotation required
- ⚠️ Playwright's failed API-request diagnostic printed GSTPilot's project cookie. Temporary auth files were deleted and the incident is in `Learning.MD`.
- ✅ A replacement project key was minted/verified, saved in `/Users/anandpareek/Documents/gstpilot/.env`, and copied to the macOS clipboard without printing it.
- ⏳ GSTPilot Render still has the old key so production is not broken; the old key must be revoked immediately after Render uses the replacement.
- Blocker: the previously supplied Render API key now returns HTTP 400. Put a fresh `RENDER_API_KEY` in Blindspot's git-ignored `.env`, or paste the current clipboard into GSTPilot Render `BLINDSPOT_API_KEY`, save/deploy, then say **rotation done**.

## Product/security follow-ups
- P1: bearer keys still have project-admin power; build scoped/expiring human vs app keys before broad beta.
- P1: current auth is project-key + invite, not Supabase Auth. Align signup-first human identity before implementing it.
- P1: add public rate limits, Sentry/OTel alerts, BullMQ retry/resume and load hardening before production traffic.
- Loop remains off; no paid eval ran.

## Next
1. Release and hosted-QA the sign-in origin fix.
2. Complete the GSTPilot Render key swap above and revoke the exposed key.
3. Align the Supabase Auth signup-first correction, then implement it one approved step at a time.
