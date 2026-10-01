# Current portfolio launch checkpoint — 2026-10-01

This section supersedes the historical July deployment/auth plans below. Current canonical baseline is `52a3fef5a35c76449bbc651aa3a753df7401c584`.

The original mocked SDK/gateway/evaluation baseline is accepted (root browser plus 28 HTTP checks). Integrated local acceptance now passes Auth.js email/password, separate owner-scoped SDK credentials, the actual SDK-ingested prepared workflow, two illustrative evaluations, Monitor, signout/signin, desktop dark and 390 px light layouts, with no browser errors or provider calls. Twelve focused frontend tests pass; the compiled Auth.js/Server Action harness passed 26 checks across 45 requests, alongside 19 real-PostgreSQL checks. These are distinct receipts, not a claim that every product path was exercised.

AWS's fresh `blindspot` database install is complete: 28 admin-owned tables, a DML-only application role, verified TLS 1.3 and a create-only web/gateway secret split. Runtime source is frozen and the reviewed Linux images are live with authentication enabled and mock mode disabled: gateway `759306459c8c37a5` / image `fe12ed3659c364e29a83d4d10db7006401c97cc764d3702b11e376581c4178ef`, web `bdfa9bece954b8d9` / image `3a0bc38d3534c913044dc4ddd245a2ad128f754e030c311a3c4174d865454408`. Live free acceptance passed 13 groups/33 requests, two isolated accounts and zero provider usage. Root verified the live prepared UI in desktop dark / 390 px light with no console errors. **Live and paid acceptance passed.** Final aggregate evidence is recorded in operator receipt `paid-sdk-verified.json`; the final read-only audit retained exactly one usage row and matching span.

Frontend ownership is pages/components/styles/client helpers and public documentation. Backend owns server actions/auth/middleware/API and prepared fixture execution. Infrastructure owns package/lock/config and deployment. Preserve baseline ports 8974/8975; coordinate integrated 8976/8977 and test 8978/8979. No provider calls during development. Root alone controls browser QA and any paid proof.

Verified live URL: https://blindspot.3-6-183-210.sslip.io. Connect snippets use the public application origin and same-origin `/v1` SDK routes, never a private gateway hostname. SDK tarball is served from the dashboard.

Retain observed-node semantics, golden lifecycle, explicit budgets, replay versus model-only evidence, and approval gates. Human project-key/invite login is retired by this launch; historical records below describe prior deployments only. Google OAuth/password recovery are not configured. See `docs/PORTFOLIO-UI.md` for exact UI boundaries.

Prepared records remain server-marked and read-only. The UI hides their namespace UUID only in display labels; values, URLs and ownership checks retain their full identity. Golden imports are bounded at 400 KiB per file and 512 KiB serialized action payload; draft counts are 1–20. Runtime evaluations remain inline without a Redis worker. Shared-provider lifetime caps default to USD 0.25 per owner/USD 2 per app.

One paid proof used one ordinary OpenAI `gpt-4o-mini` SDK completion: HTTP 200 at 08:55:23.449–08:55:25.639 UTC on 1 October 2026, 16 input/5 output tokens, estimated USD 0.0000054. One usage row matched the SDK key/project and observed metadata span. No retry, judge, evaluation or golden-generation request ran. Monitor rounded stored 0.00054 cents to 0.001 cents. The two prepared evaluations retain fixed illustrative 90% scores; neither is paid model-quality evidence. Two low AI SDK 4 dependency advisories remain mitigated by text-only input and bounded transport, not dependency upgrades.

---

## Historical handoff (preserved)

# Handoff.MD — Blindspot
> last-synced: 49eb569
> Continue with: **Refer to Handoff.MD in `/Users/anandpareek/Documents/Projects/blindspot` and begin**

## Active work — 2026-07-22 (Claude took over from codex)
Reframe **Monitor → Insights → Evals + Supabase front door**. Order: **Slice 1 Monitor (A) →
2 Insights (B) → 3 Eval-polish/function-nodes (C) → 4 Supabase (D)** (A/B/C are `projectId`-scoped
so Supabase slots under later, no rework). Spec (APPROVED) + plan under `docs/superpowers/`.
Env note: this repo needs **Node 22** — prepend `~/.nvm/versions/node/v22.22.0/bin` to PATH or pnpm breaks.

- **Slice 1 Monitor — SHIPPED & LIVE (deployed `49eb569`, 2026-07-22; on `main` + `origin/main`).**
  `execution_feedback` table (migration `0007_thankful_rage.sql`, applied to Render DB) ·
  `packages/core/src/metrics.ts` (7/30/90d + previous-period + node filter + p95 + monthly trend,
  **project-ownership enforced**) · `GET /v1/metrics` + `POST /v1/feedback` (`monitor-v1`) · SDK
  `feedback()` · `/monitor` screen+nav · `test:metrics` (Loop F4). Verified live: healthz has
  `monitor-v1`; `/v1/metrics` + `/v1/feedback` 401-gated; `/monitor`→login; prod DB migrated.
- **FMEA (scan `0ef862a`, state stamped `1add5d2`):** P0 cross-tenant metrics IDOR — **FIXED +
  regression test**. P2 backlog (open): feedback orphaned when its workflow isn't seen yet
  (`workflowId=null`, uncounted); no feedback idempotency (double-submit double-counts); metrics
  rollup/materialization at scale (Phase 8).
- **Next:** Slice 2 **Insights (B)** — agentic hypothesis→evidence→recommendation over Monitor
  signals. Then C eval-polish/function-nodes, D Supabase. Still open from takeover: rotate the
  exposed GSTPilot prod key; declared-vs-observed topology.

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
