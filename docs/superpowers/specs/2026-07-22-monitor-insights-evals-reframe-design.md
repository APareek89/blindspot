# Design — Monitor · Insights · Evals reframe (+ Supabase front door)

- **Date:** 2026-07-22
- **Owner:** Anand Pareek
- **Status:** Proposed — awaiting user review
- **Author of change:** Claude (takeover from codex)
- **Baseline SHA:** `37ae225`

This spec reframes Blindspot's existing, deployed product around a **Monitor → Diagnose → Eval**
story with a real signup front door. It is grounded in the current codebase, not the marketing docs:
the whole thing is an **evolution of what already ships**, not a rebuild. The approved architecture,
the two non-negotiables (approval-gated swaps; golden-set lifecycle), and the metadata-by-default
consent spine all stay exactly as they are.

---

## 0. Why this is an evolution, not a rebuild

Verified against the code (`packages/core`, `apps/gateway`, `apps/dashboard`, `packages/db/src/schema.ts`):

- **C (Evals) is ~80% built.** Golden sets (upload OR agent-generate from `.MD`/brief/context),
  compatible-model discovery (model registry + two-gate compatibility), `model_only` + `workflow_replay`
  eval runs, per-example evidence table, cost/accuracy Recommendation, Approvals inbox, drift lanes —
  all present and deployed. Gap: evals only cover **generation** nodes (routes); function/tool/retrieval
  nodes have no eval path.
- **A (Monitor) substrate exists but has no product surface.** `getWorkflowDetail` already computes
  per-node `spanCount`, `avgLatencyMs`, `totalCostCents`, `errorCount` — but **lifetime-only**. There is
  **no time-window / previous-period / trend logic anywhere**, no per-node time-series, no end-user
  feedback, and no "did it answer" signal. `getOverview` is **eval-centric** (quality, savings,
  approvals, drift), not operational.
- **B (Insights) does not exist.** No diagnosis / analyze / anomaly / root-cause code. This is the
  biggest net-new build — but it fits the product's existing "hypothesis → evidence → human-approved
  recommendation" DNA.
- **D (Supabase auth) is not present.** Auth today is **project-key cookie (`bs_key`) + signed-invite
  signup**; the only identity is `projects.userId` (a `text` column). One project per session, no
  account/org concept, no project picker.

**Key structural fact that drives sequencing:** every A/B/C query in the codebase keys off `projectId`,
never `userId`. The data layer is already project-scoped. Therefore **Supabase can be added underneath
later without changing any Monitor/Insights/Eval query.**

---

## 1. Scope decomposition & build order

Four sub-projects, each with its own spec → plan → implementation cycle. This document specifies
**Slice 1 in full** and sketches 2–4 (to be detailed in their own specs).

| Slice | Subsystem | Depends on | Rationale for position |
|---|---|---|---|
| **1** | **Monitor (A)** | existing span/execution/trace data | Highest visible payoff; additive read-layer + 2 new signals; independent of auth; zero rework risk |
| **2** | **Insights (B)** | Slice 1 metrics | Diagnosis reasons over A's signals; must exist first |
| **3** | **Evals polish (C)** | existing eval engine | Extend to function/tool/retrieval nodes + connect-time `.MD`; smallest gap |
| **4** | **Supabase (D)** | its own identity/org design | Biggest shape change; aligned separately; A/B/C queries unaffected |

**Reversibility note:** if the user prioritizes the signup front door over visible monitoring, Slices 1
and 4 swap — the rest of the plan is unchanged, because A/B/C never depended on the auth model.

---

## 2. Slice 1 — Monitor (this slice, in full)

### 2.1 Goal

A dedicated **Monitor** screen per project/workflow that answers "is my agent healthy?" with:

- **Scorecards** for 7D / 30D / 90D, each **vs the previous equal period** (Δ and direction).
- A **monthly trend** chart below, with a **node filter** (all nodes, or one selected node).

Scaled to the smallest version that proves it (scope brake): **latency + cost + failure-rate for one
real workflow (GSTPilot production), over 7/30/90D with previous-period deltas and a node filter, from
data already ingested.** Everything else is an additive extension on top of that spine.

### 2.2 Metrics

**Tier A — available now at `metadata` capture (no new consent, no cost):**

| # | Metric | Source | Notes |
|---|---|---|---|
| A.1 | Latency: **p50 / p95 / p99 + avg** | `workflow_spans.latencyMs`, execution duration | Percentiles, not just mean — tail latency is the UX signal |
| A.4 | Cost: per node, per execution, per session | `workflow_spans.costCents` | Also cost-per-execution unit economics |
| A.2 | Workflow failure rate | `workflow_executions.status = 'error'`, or never reached `completed` | "final output never went to the user" |
| A.6a | Throughput / volume | count of executions & spans in window | executions/day, active sessions |
| A.6b | Token usage | `input_tokens` / `output_tokens` | feeds cost trends |
| A.6c | Error taxonomy | `workflow_spans.status='error'`, `error` text, grouped by node kind | top failing nodes / messages |
| A.6d | Model-version mix over time | `workflow_spans.model` | early-warning for silent provider version bumps (ties to Drift) |
| A.6e | Node bottleneck ranking | per-node share of total latency / cost | where to look first |
| A.6f | Abandonment rate | executions `running` that never `completed` in-window | proxy for "no answer" without content |

**Tier B — net-new signals requiring explicit sign-off:**

- **A.5 — End-user feedback** (👍/👎/score). *No end-user feedback exists today.* Requires:
  - SDK: `blindspot.feedback({ executionId, sessionId?, kind: 'up'|'down'|'score', value?, comment? })`
  - New table `execution_feedback(id, project_id, workflow_id?, execution_external_id, node_name?,
    kind, value, comment?, created_at)` — additive, own migration.
  - Gateway: `POST /v1/feedback` (Bearer apiKey-hash auth, same as ingest).
  - **Consent:** app-supplied and metadata-safe by default; only the optional `comment` is content and
    is opt-in. Never attaches app logs implicitly (mirrors `beta_feedback`'s stance).
- **A.3 — "Responded but didn't answer."** Cannot be derived from metadata. Two honest tiers:
  - **Free/app-signaled (ship first):** "no final answer delivered" = execution not `completed`, or the
    app sets `answered: false` in execution metadata. Surfaced as a **no-answer rate**. Zero content,
    zero cost.
  - **Paid/LLM-judge (opt-in, later):** an async judge over the final answer vs the user's question.
    Requires `full` capture **and** costs money → gated behind `consent.paid_evals`. Not turned on
    silently; not part of the smallest version.

### 2.3 Time model

A single windowing helper computes, for any metric:

- **current window** (7/30/90D from now),
- **previous window** (the equal-length period immediately before),
- **delta** (absolute + %), with a per-metric notion of "good direction",
- **monthly trend** buckets (calendar-month or rolling-30D buckets over ~12 months),
- all **filterable by `nodeId`** (default: whole workflow).

Windows are computed in SQL against `startedAt`/`created_at` (indexed). No historical KPI snapshot table
is introduced for Slice 1 — everything is derived on read from raw spans/executions, which is correct
at current beta volume. (A rollup/materialization table is a Phase-8 scale concern, noted not built.)

### 2.4 New code (all additive, low blast-radius)

- `packages/core/src/metrics.ts` — windowed aggregation service. Pure reads over
  `workflow_spans` / `workflow_executions` / `traces` / `execution_feedback`, keyed by
  `projectId` (+ optional `workflowId`, `nodeId`, window). One exported function per metric group
  returning `{ current, previous, delta, trend[] }`.
- `packages/shared` — Zod schemas for the metrics response and the new feedback input.
- `packages/sdk` — `feedback()` method (best-effort, same queue/flush machinery as spans).
- `apps/gateway/src/manage/metrics.ts` — `GET /v1/metrics?workflowId&nodeId&window` (Bearer auth).
- `apps/gateway/src/manage/feedback.ts` (or a new `end-user-feedback.ts`) — `POST /v1/feedback`.
- `packages/db/src/schema.ts` + a new additive migration — `execution_feedback` table.
- `apps/dashboard/app/(app)/monitor/page.tsx` — the Monitor screen; `components/Sidebar.tsx` gets a
  **Monitor** nav item (placed second, after Overview).

### 2.5 Architecture delta (plain language — the change to approve)

> Today: the SDK streams spans → gateway ingests them → the dashboard shows lifetime per-node numbers
> and eval-centric KPIs.
>
> This slice adds: (1) a **read-only metrics service** that slices the *same* span data by time window
> and node, with previous-period comparison and a monthly trend — no new data required; and (2) a
> **new, thin end-user-feedback channel** (one SDK call → one endpoint → one new table) so the app can
> report 👍/👎 tied to an execution. Nothing about routing, evals, or approvals changes. The only
> data-model change is the additive `execution_feedback` table.
>
> **Failure the user would care about:** a bad feedback write or a slow metrics query must never affect
> the host app's live traffic. Feedback ingest is best-effort and isolated (like span ingest); metrics
> are read-only and dashboard-only. Neither is on the app's request path.

Mermaid: add `docs/mermaid/09-monitor-metrics.mmd` (master granularity) showing
spans/executions/feedback → metrics service → Monitor screen; regenerate the viewer.

### 2.6 Consent recap (answers "what will be allowed to get")

- Monitor Tier-A metrics run entirely on **existing metadata** — no capture change, no new consent.
- **End-user feedback** is app-supplied and metadata-safe; the optional free-text `comment` is the only
  content and is explicitly opt-in.
- **"Did it answer" (judge tier)** and any content-level Insight (Slice 2) require `full` capture and,
  for the judge, `consent.paid_evals`. Surfaced as a visible **"enable output capture to unlock X"**
  affordance — never silent. This preserves the product's metadata-by-default spine.

### 2.7 Out of scope for Slice 1

- Supabase auth / multi-project / project picker (Slice 4).
- The Insights diagnosis agent (Slice 2).
- Function/tool/retrieval-node evals and connect-time `.MD` ingestion (Slice 3).
- Historical KPI snapshot/rollup tables, OTel/Sentry, alerting/notifications (Phase 8).
- Turning on content capture or any paid judge by default.

### 2.8 Verification (free / zero-token, per Loop.MD Rung 1)

- `pnpm typecheck && pnpm test:auth-origin && pnpm test:eval-plan && pnpm build` stay green.
- New unit tests for `metrics.ts`: window boundaries, previous-period math, node filter, empty-project
  zero-state (mirrors `getOverview`'s empty return).
- Migration applies additively; existing endpoints unaffected.
- Manual: connect GSTPilot production data → `/monitor` shows non-zero latency/cost/failure for 7/30/90D
  with previous-period deltas and a working node filter.
- FMEA (per `.power-coding` on feature-complete): migration, new external ingest endpoint, and
  error-handling on the feedback path are in-scope categories.

---

## 3. Slices 2–4 (sketch — each gets its own spec later)

### Slice 2 — Insights (B): agentic, hypothesis-driven, evidence-based diagnosis

A diagnosis service that consumes Slice 1 signals and produces **evidence-backed, human-approved**
recommendations — the same trust pattern as the model-swap engine, applied to operations. Example
hypotheses: latency variance → which node/model/percentile is drifting; a function/retrieval node
failing to extract or low-confidence → what to check; poor user feedback → correlate with node, model
version, or input class. Output is a recommendation with the evidence that produced it, never an
auto-action. Content-level diagnosis requires `full` capture (gated).

### Slice 3 — Evals polish (C): function nodes + connect-time briefs

- Extend the eval/golden/recommendation loop from generation routes to **function / tool / retrieval**
  nodes (the PRD §14 "function-eval layer": typed fixtures / invariants — exact/schema/property,
  side-effect, latency, idempotency — producing code/test recommendations, not model swaps).
- Tighten the connect-time flow so uploading a product brief / sample evals / `.MD` files during
  connection feeds the Golden Set Agent (the `shareContext` manifest path already exists).

### Slice 4 — Supabase (D): signup-first identity

- Replace project-key cookie + signed-invite signup with **Supabase Auth** signup-first.
- Introduce accounts and (likely) organizations; map users → many projects; project picker in the shell.
- Scoped/expiring human-vs-application keys (Handoff risk #2). Migrate existing invite/project-key users.
- **Requires its own architecture-alignment pass before code** (identity, org model, key scoping,
  migration path). A/B/C queries stay `projectId`-scoped and are unaffected.

---

## 4. Open decisions to confirm at review

1. **Sequencing:** Monitor (A) first, Supabase (D) as its own later slice — OK, or lead with Supabase?
2. **A.3 "didn't answer":** ship the free app-signaled version first, LLM-judge as opt-in paid later —
   agreed?
3. **End-user feedback shape:** new `execution_feedback` table + `blindspot.feedback()` SDK method +
   `POST /v1/feedback` — agreed? (This is the one data-model change in Slice 1.)
4. **Monitor placement:** new top-level **Monitor** screen (recommended), vs folding metrics into the
   existing Overview screen.
