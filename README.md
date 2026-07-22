# Blindspot

Blindspot is an improvement workspace for an already-built AI agent. It observes the model-powered
parts of a workflow, builds user-owned golden sets, compares technically compatible models within an
explicit budget, and surfaces evidence-backed recommendations. A live model never changes without
the user's approval.

## Claude takeover — start here

This repository is already implemented and deployed. Do not scaffold a replacement or re-litigate
the approved stack. In a new Claude Code session, use:

> Refer to `Handoff.MD` in `/Users/anandpareek/Documents/Projects/blindspot` and begin.

Read in this order:

1. [`AGENTS.md`](./AGENTS.md) — operating rules and non-negotiables.
2. [`Handoff.MD`](./Handoff.MD) — current checkpoint, known risks and exact next work.
3. [`Loop.MD`](./Loop.MD) — test-loop status and paid-eval consent.
4. [`Blindspot-PRD.md`](./Blindspot-PRD.md) — product contract and approved architecture.
5. [`docs/ARCHITECTURE_FLOW.md`](./docs/ARCHITECTURE_FLOW.md) — runtime semantics and diagrams.

`CLAUDE.md` imports the repository agent rules. Reconcile `Handoff.MD`'s `last-synced` SHA against
`git log` before changing code, keep secrets out of output, and update the handoff before a checkpoint.

## Current product truth — 2026-07-22

| State | What is true |
|---|---|
| Live | Gateway and dashboard run on Render; invite signup, project-key sessions, Connect, observed workflows, golden-set management, budgeted evidence, approvals, drift lanes and feedback are deployed. |
| Proven integration | Hosted GSTPilot sends metadata-only, observe-only telemetry. Production has 2 executions and 3 distinct observed nodes; development has 5 executions and 7 observed nodes. |
| Partial | The SDK can accept agent, generation, retrieval, tool and function spans, but GSTPilot currently instruments the root agent span and shared LLM-call wrapper only. |
| Not yet built | Declared/static workflow manifests, production-vs-development coverage UI, Supabase human identity, Redis worker durability, automatic operational drift thresholds, live semantic scheduling, OTel/Sentry and load hardening. |

The dashboard's current `nodeCount` is the number of distinct node names actually ingested for one
workflow and environment. It is **not** a static count of all branches or deterministic functions in
the source application. Repeating the same path increases spans/executions, not distinct nodes.

## Live endpoints

- Dashboard: <https://blindspot-dashboard.onrender.com>
- Gateway health: <https://blindspot-gateway.onrender.com/healthz>
- Connected test app: <https://gstpilot.onrender.com>

Render's free tier can cold-start. A temporary 502 means the dashboard could not reach a waking
gateway; it is not an authentication verdict. Production-grade retry/error UX remains a P1.

## Repository map

```text
apps/gateway       OpenAI-compatible gateway, management API and authenticated span ingest
apps/dashboard     Next.js workspace and invite/project-key session flow
apps/worker        BullMQ worker entry point; local/hosted beta currently evaluates inline
packages/core      Golden, eval, recommendation, drift, onboarding and workflow services
packages/db        Drizzle schema and additive Postgres migrations
packages/providers Provider catalog/adapters and capability normalization
packages/sdk       TypeScript connector for existing applications
packages/shared    Zod schemas and shared types
docs/mermaid       Canonical architecture sources
```

## Local development

Requirements: Node 20+, `pnpm` 11, and Postgres. Redis is deliberately optional while
`BLINDSPOT_EVAL_MODE=inline`.

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm start:gateway
pnpm start:dashboard
```

Run the gateway and dashboard in separate terminals. Secret values belong only in the git-ignored
`.env`; required variable names and roles are documented in [`.env.example`](./.env.example).

## Safe verification

These checks use no model tokens unless a developer separately authorizes a paid provider flow:

```bash
pnpm typecheck
pnpm test:auth-origin
pnpm test:eval-plan
pnpm build
```

Mermaid sources are canonical; regenerate the viewer after diagram edits:

```bash
node /Users/anandpareek/.codex/skills/power-coding/scripts/validate-mmd.mjs docs/mermaid
node /Users/anandpareek/.codex/skills/power-coding/scripts/build-html.mjs docs/mermaid docs/architecture-flow.html
```

## Documentation index

- [`docs/BETA_ONBOARDING.md`](./docs/BETA_ONBOARDING.md) — invite a tester and connect an app.
- [`packages/sdk/README.md`](./packages/sdk/README.md) — connector contract and instrumentation.
- [`docs/RENDER_DEPLOYMENT.md`](./docs/RENDER_DEPLOYMENT.md) — verified hosted state and operations.
- [`docs/FUNCTION_EVALS.md`](./docs/FUNCTION_EVALS.md) — planned deterministic function-eval layer.
- [`Learning.MD`](./Learning.MD) — root causes and preventive rules from past bugs.
- [`SETUP-secrets-and-deps-prompt.md`](./SETUP-secrets-and-deps-prompt.md) — historical/bootstrap
  credential setup; do not rerun as a product step.

The next engineer should begin with the unresolved items in `Handoff.MD`, not with Phase 0.
