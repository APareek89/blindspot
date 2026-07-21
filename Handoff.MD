# Handoff.MD — Blindspot
> last-synced: fb4cfc2 · FIRST reconcile `git log --oneline fb4cfc2..HEAD`, then read Loop.MD.
> Continue with: **Refer to Handoff.MD in `/Users/anandpareek/Documents/Projects/Blindspot_v1` and begin**

## Current state
- ✅ Shipped locally through agent-workspace 7A–7C plus the 2026-07-18 evidence/concurrency/dependency QA; see git log, `Learning.MD` and `docs/ARCHITECTURE_FLOW.md`.
- ✅ **gstpilot live 2026-07-21:** 3 real questions → selected `gstpilot@development`, 3 executions,
  1 pipeline agent + 4 generation routes across Haiku/Sonnet. Example `f6036d1d-125a-4a47-a3ad-67129952d3bd` is `completed`, metadata-only, with tokens/latency and zero errors.
- ✅ Observe-only bridge checkpointed in gstpilot at `02f8c81`; its local SDK sibling link, Langfuse
  dual-write and terminal/non-blocking boundary do not reroute Claude calls.
- ✅ Typechecks, zero-token eval-plan regression (including lifecycle ownership), 9/9 Mermaid validation,
  secret scan and localhost HTTP checks pass. Gateway :8787, dashboard :3001 and gstpilot :3000 are live.

## FMEA / Sentinel outcome
- ✅ Full 12-category connector scan at `fb4cfc2` + working trees: no P0. Fixed child-span lifecycle
  downgrade, blocking telemetry flush and tool/system compatibility under-reporting.
- ⚠️ P1: local sibling SDK link is not deployable; captured spans lack calculated cost until pricing
  reconciliation; Phase 8 still owns queue recovery, rate limits, pricing freshness, OTel/Sentry and load.
- ⚠️ P2: long-thread compaction is not observed, fatal pipeline exits can remain running, gstpilot hides
  its Supabase insert error, plus prior duplicate-rec/capture-purge/two-low-advisory debt. No eval was run.

## Decisions
- 2026-07-18 — Eval spend remains an immutable single-use server authorization; incomplete or incomparable evidence cannot recommend or switch.
- 2026-07-18 — Redis stays bypassed locally until Monday; queue durability/rate limits/observability remain Phase 8, not an unreviewed weekend architecture change.
- 2026-07-18 — Loop remains `off`; paid evals stay `ask`. Power Coding defaults added as `git checkpoints=auto`, `full FMEA=ask`, Sentinel/session pulse manual/off.

## Monday — pending
- 🧑 USER: inspect the selected `gstpilot@development` workflow and its four generation routes in the
  dashboard, then sync the Anthropic model catalogue in Settings (the registry was empty before this run).
- 🧑 USER: keep or change capture mode (`metadata` current; `inputs`/`full` opt-in), choose golden
  context, Sonnet/Haiku and the displayed eval cap before the first paid Claude evaluation.
- 🤖 After user inspection: replace the temporary sibling-package link with the intended SDK
  distribution shape; convert gstpilot's nested `evals/golden.json` into Blindspot's versioned examples.
- 🧑 USER before Redis: rotate the previously exposed Upstash credential and update the git-ignored `.env`; never paste it in chat.
- 🤖 Then: Phase 7D continuous selected-node monitoring/debug/simulation; Phase 8 queue handoff + recovery/rate limits/pricing/OTel/Sentry/k6; decide AI SDK v5 migration; Phase 9 Render deploy.

## Run
Blindspot: `pnpm start:gateway` (:8787) · `pnpm start:dashboard` (:3001) · verify `pnpm typecheck && pnpm test:eval-plan && pnpm build`.
gstpilot (:3000): `NODE_EXTRA_CA_CERTS='/Users/anandpareek/Documents/SEO content Skill/scripts/system-ca-bundle.pem' pnpm dev` (the CA bundle is required for Supabase on this machine).
