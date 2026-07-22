# Handoff.MD — Blindspot
> last-synced: 9cdb7d9
> Continue with: **Refer to Handoff.MD in `/Users/anandpareek/Documents/Projects/blindspot` and begin**

## Current checkpoint
- ✅ `9cdb7d9` is on GitHub `main` and live on Render: project-key sign-in accepts Chromium's legitimate `Origin: null` only with browser-proven same-origin navigation metadata.
- ✅ Hosted matrix: opaque same-origin and exact-origin forms reach key validation (303); cross-site and missing-origin posts stay 403.
- ✅ Hosted Playwright captured the real `Origin: null` form returning 303 with zero console errors; a real project key set the secure session and opened `/connect` with 200 without printing the key.
- ✅ Full typecheck, route regression, zero-token integration suite, production build, secret scan and relevant Mermaid validation passed; provider token cost stayed 0.

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
- P1: free Render cold starts can still surface a transient 502; add warm-service resilience and production-appropriate error UX.
- P1: add public rate limits, Sentry/OTel alerts, BullMQ retry/resume and load hardening before production traffic.
- FMEA at `9cdb7d9`: 0 P0; 2 existing P1 above; P2s are fail-closed raw 403 UX in header-stripping browsers and no disposable automated happy-path cookie fixture; 12/12 categories checked.
- Loop remains off; no paid eval ran.

## Next
1. User retries the hosted project-key sign-in; the cross-origin JSON error is fixed live.
2. Complete the GSTPilot Render key swap above and revoke the exposed key.
3. Align the Supabase Auth signup-first correction, then implement it one approved step at a time.
