# Handoff.MD — Blindspot
> last-synced: 844410c
> Continue with: **Refer to Handoff.MD in `/Users/anandpareek/Documents/Projects/blindspot` and begin**

## Active work — 2026-07-22 (Claude took over from codex)
Reframe **Monitor → Insights → Evals + Supabase front door**. Order: **Slice 1 Monitor (A) →
2 Insights (B) → 3 Eval-polish/function-nodes (C) → 4 Supabase (D)** (A/B/C are `projectId`-scoped
so Supabase slots under later, no rework). Spec (APPROVED) + plan under `docs/superpowers/`.
Env note: this repo needs **Node 22** — prepend `~/.nvm/versions/node/v22.22.0/bin` to PATH or pnpm breaks.

- **Slice 1 Monitor — BUILT + verified on branch `slice-1-monitor` (commits `ba6b9ce..844410c`;
  NOT merged to main, NOT pushed, NOT deployed).** Added: `execution_feedback` table (migration
  `0007_thankful_rage.sql`) · `packages/core/src/metrics.ts` (7/30/90d + previous-period + node
  filter + monthly trend) · `GET /v1/metrics` + `POST /v1/feedback` (`monitor-v1`) · SDK
  `feedback()` · `/monitor` screen + nav · `test:metrics` (Loop F4). Rung 1 all green, secret-scan
  clean, 10/10 mermaid.
- **PENDING (user-gated):** (1) offered full FMEA scan (`consent.fmea_full_scan: ask`); (2) merge
  `slice-1-monitor` → main + push → **Render auto-deploys**; (3) apply `0007_thankful_rage.sql` to
  the Render DB (deploy does NOT migrate); then verify `/monitor` + feedback against GSTPilot.
- Not started: B Insights, C eval-polish/function-nodes, D Supabase.

## Takeover checkpoint — 2026-07-22
- Branch: `main`; `1915846` is the last pre-takeover HEAD and is on `origin/main`.
- Read order: `AGENTS.md` → this file → `Loop.MD` → `README.md` → `Blindspot-PRD.md` → `docs/ARCHITECTURE_FLOW.md`.
- Architecture was approved 2026-07-16. Do not restart Phase 0 or re-litigate the stack.
- All 13 Markdown files and all 9 Mermaid sources were reconciled for Claude takeover; the root `README.md` is now the map.

## Live product truth
- Render gateway/dashboard are live; invite signup, project-key sessions, Connect, workflows, golden
  lifecycle, budgeted evidence, approvals, drift and feedback are deployed.
- Auth is **signed invite + Blindspot project keys**, not Supabase Auth; signup-first human identity,
  organizations and scoped human/app credentials remain a product/architecture decision.
- Current beta eval mode is inline; Redis/durable retries, rate limits, OTel/Sentry and k6 remain
  Phase 8; cold starts can surface temporary 502s. Approval gates and golden lifecycle remain fixed.

## GSTPilot evidence and the node-count correction
- Hosted `gstpilot / production` is connected in `metadata + observe_only`: 2 executions, 3 observed
  nodes, last seen 2026-07-21 09:05:22 UTC. Development: 5 executions, 7 observed nodes.
- `nodeCount` is the environment-scoped union of ingested node names—not a static/source topology.
  GSTPilot emits the `pipeline` root plus wrapped LLM generations. Uninstrumented/unexecuted
  deterministic branches are absent; the first root-only production request was not backfilled.
- Next topology proof: declared startup manifest + declared/dev/prod/unseen coverage, explicit spans
  for deterministic nodes, and UI wording “observed nodes.”

## Immediate risks / next decisions
1. **Rotate the exposed GSTPilot production key:** replacement is verified in GSTPilot's git-ignored
   `.env` and clipboard. Replace Render `BLINDSPOT_API_KEY`, deploy, verify one safe request, then
   revoke the old key. The old Render API token returns HTTP 400; never print either credential.
2. Align signup-first Supabase Auth, organizations and scoped/expiring human vs application keys
   before implementing broader beta identity.
3. Build declared-vs-observed topology/coverage and instrument GSTPilot deterministic nodes.
4. Add gateway cold-start retry/error UX, then Phase 8 durability/monitoring before production traffic.

## Verification at this checkpoint
- PASS: `pnpm typecheck`, `pnpm test:auth-origin`, `pnpm test:eval-plan`, `pnpm build`.
- PASS: Mermaid 9/9 + rebuilt viewer; Markdown local links 13/13; 23-file secret scan; token cost 0.
- Loop remains `off`; no paid eval ran. Documentation-only change; no runtime feature/FMEA delta.
