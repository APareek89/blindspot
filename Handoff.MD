# Handoff.MD — Blindspot
> last-synced: c32fb88 · FIRST reconcile `git log --oneline c32fb88..HEAD`, then read Loop.MD.
> Continue with: **Refer to Handoff.MD in `/Users/anandpareek/Documents/Projects/Blindspot_v1` and begin**

## Current state
- ✅ Shipped locally through agent-workspace **7A Connect + Observe, 7B Registry + Compatibility, 7C Budget-authorized Quality + Experiment**; see `Blindspot-PRD.md` and `docs/ARCHITECTURE_FLOW.md`.
- ✅ 2026-07-18 Power Coding QA closed all P0s found: recommendations now require complete same-plan live/candidate evidence; unknown price cannot prove savings/auto-approve; approval/rejection and route changes are locked and stale baselines are rejected.
- ✅ Golden versions serialize concurrent creation, workflow requirement merges lock against lost updates, and only a same-route trace can be promoted. A recommendation/inbox failure no longer rewrites a completed paid eval as failed.
- ✅ Production dependency audit improved from 29 findings (2 critical/9 high) to **2 low**: Next 15.5.18, Drizzle 0.45.2, patched PostCSS/jsondiffpatch. Remaining AI SDK v4 advisories need a deliberate v5 adapter migration.
- ✅ `pnpm typecheck`, zero-token `pnpm test:eval-plan`, production build, 9/9 Mermaid validation, full secret scan and localhost HTTP smoke pass. Integration coverage proves sampling/evidence/no silent swap/no replay plus legacy, candidate-only, stale-approval, cross-route and concurrency guards. Provider token cost: $0.
- ✅ Gateway `http://localhost:8787/healthz` and freshly restarted dashboard `http://localhost:3001/login` return 200 in active Codex sessions. In-app browser bootstrap remains unavailable; compiled UI + HTTP are verified, click-through is not claimed.

## FMEA / Sentinel outcome
- ✅ Full 12-category scan at `c32fb88` + QA working tree: no P0 remains after fixes above; secret/supply-chain/tenant and approval boundaries checked.
- ⚠️ Phase 8 P1s: inline eval crash/stale-plan recovery and long HTTP runs; project/provider rate limits; versioned pricing freshness/cost reconciliation; OTel/Sentry + dropped-trace/eval alerts and load tests.
- ⚠️ P2: duplicate pending-Recommendation race, capture-mode downgrade does not purge older retained content, and two low AI SDK v4 advisories. No paid eval was run.

## Decisions
- 2026-07-18 — Eval spend remains an immutable single-use server authorization; incomplete or incomparable evidence cannot recommend or switch.
- 2026-07-18 — Redis stays bypassed locally until Monday; queue durability/rate limits/observability remain Phase 8, not an unreviewed weekend architecture change.
- 2026-07-18 — Loop remains `off`; paid evals stay `ask`. Power Coding defaults added as `git checkpoints=auto`, `full FMEA=ask`, Sentinel/session pulse manual/off.

## Monday — pending
- 🧑 USER: confirm or change the new Power Coding defaults above (they are ⚠️ unconfirmed), then sign into localhost with an existing `bs_live_` key or bootstrap one.
- 🧑 USER: connect gstpilot, select its workflow and capture mode (`metadata` default; `inputs`/`full` opt-in), choose golden context, Sonnet/Haiku and the displayed eval cap before the first paid Claude run.
- 🧑 USER before Redis: rotate the previously exposed Upstash credential and update the git-ignored `.env`; never paste it in chat.
- 🤖 Then: Phase 7D continuous selected-node monitoring/debug/simulation; Phase 8 queue handoff + recovery/rate limits/pricing/OTel/Sentry/k6; decide AI SDK v5 migration; Phase 9 Render deploy.

## Run
Gateway `pnpm start:gateway` (:8787) · dashboard `pnpm start:dashboard` (:3001) · verify `pnpm typecheck && pnpm test:eval-plan && pnpm build`.
