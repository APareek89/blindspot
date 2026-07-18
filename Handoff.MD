# Handoff.MD — Blindspot
> last-synced: bfbe5bc + Phase 7C working tree · Read this + Loop.MD at session start. Update before checkpoints/commits.
> Continue with: **Refer to Handoff.MD in `/Users/anandpareek/Documents/Projects/Blindspot_v1` and begin**

## Current state
- ✅ Shipped through Phase 7; agent-workspace Phases **7A Connect + Observe, 7B Registry + Compatibility and 7C Quality + Experiment** are built locally.
- ✅ Free immutable eval estimate → full or SHA-seeded stratified sample → exact selected/omitted disclosure → explicit confirmation → single-use authorized run.
- ✅ Every selected model/example persists output, score, criteria, reasoning, issues, latency and provider-reported candidate/judge cost; only complete evidence can create a Recommendation.
- ✅ Raw eval, real paid drift and CI-gate bypasses return 409. `live_model` remains unchanged unless a Recommendation is approved or the route explicitly opted into cheaper-within-band auto-approve.
- ✅ Golden agent accepts product brief, system prompt and architecture; production traces are used only via explicit checkbox and bounded before provider submission.
- ✅ Migration `0003_nice_jigsaw.sql` is applied to dev Postgres. Anthropic Sonnet 4.6 / Haiku 4.5 pricing matches the official current pricing page; HF + Fireworks wiring remains pluggable.
- ✅ `pnpm typecheck`, production build, 9/9 Mermaid validation and `pnpm test:eval-plan` pass. The integration test uses real Postgres + fake provider runtime, costs zero provider tokens, proves sampling/evidence/pending Recommendation/no live swap/no replay.
- ✅ Local gateway `http://localhost:8787` and dashboard `http://localhost:3001` are healthy in the active Codex sessions.
- ⚠️ In-app browser bootstrap still fails (`Cannot redefine property: process`); compiled UI + HTTP verified, click-through not claimed.

## Decisions
- Eval spend is a server authorization object, not a UI convention. Plan TTL is 30 minutes; selected examples are snapshotted/hashed; budget reduction is visible deterministic sampling.
- Local evals remain inline and Redis-bypassed until Monday. Queue handoff, crash recovery, plan-aware CI/drift jobs, rate limits and Sentry/OTel remain Phase 8.
- Loop stays `off`; no paid eval/model calls without the user seeing and confirming the estimate.

## Pending — next checkpoint needs user OK
- 🧑 USER: sign into localhost with an existing `bs_live_` project key (or run bootstrap), inspect the Experiment panel, then connect gstpilot with the SDK envs and choose its workflow.
- 🧑 USER: decide capture mode (`metadata` default; `inputs`/`full` opt-in), golden source/context, candidate models and displayed eval cap before the first paid Claude run.
- 🧑 USER before Redis use: rotate the previously exposed Upstash credential and update the git-ignored env; never paste it in chat.
- 🤖 Phase 7D after the localhost checkpoint: continuous selected-node monitoring, budget-authorized drift simulation/debug and approval application.
- 🤖 Phase 8 P1: BullMQ + stale-plan recovery/DLQ, plan-aware CI/drift, rate limits, unknown-cost/retry handling, pricing freshness, OTel/Sentry and load tests.
## Run
Migrate `pnpm --filter @blindspot/db db:push` · gateway `pnpm start:gateway` (:8787) · dashboard `pnpm start:dashboard` (:3001) · verify `pnpm typecheck && pnpm test:eval-plan && pnpm build`.
