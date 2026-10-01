# Blindspot

Blindspot observes the model-powered parts of an existing AI agent, builds user-owned golden sets, compares compatible models within a reviewed budget, and surfaces recommendations. Its workflow view contains **observed, instrumented nodes**, not inferred source topology. Model-only screening does not prove a production swap is safe. Managed changes remain approval-gated; observe-only approvals wait for an external rollout.

## Verified AWS application

Open [Blindspot on AWS](https://blindspot.3-6-183-210.sslip.io). Live account isolation, prepared examples, browser acceptance and one paid SDK completion passed on 1 October 2026. Final read-only audit confirmed the usage row and SDK span were unchanged; root verified the live Monitor with no console errors. Historical Render deployments are not the acceptance evidence for this release.

The launch implementation replaces project-key human login with email/password accounts, while SDK keys remain separate credentials. The dashboard uses the shared Lovable token system, self-hosted Inter and Roboto Mono, Lucide icons and both themes. Existing Monitor, workflow selection, route policies, budget plans, Golden Sets, approval, drift and feedback controls are retained.

Start in three steps:

1. Create an account and sign in to your own workspace.
2. Choose **Try with an example** to inspect a prepared workflow and evaluation evidence with no provider calls.
3. To connect your own agent, mint an SDK key in Settings and follow Connect. Review provider configuration, data capture and evaluation budget before running ordinary paid work.

A prepared example is a fixture demonstration, not production performance or a live model-quality claim. Google sign-in and password recovery are not configured. Fresh SDK keys are shown once; hide them before sharing a screenshot.

## Repository map

```text
apps/gateway       OpenAI-compatible gateway, management API and authenticated span ingest
apps/dashboard     Next.js workspace, Auth.js Credentials and verified owner sessions
apps/worker        BullMQ worker entry point; local/hosted beta currently evaluates inline
packages/core      Golden, eval, recommendation, drift, onboarding and workflow services
packages/db        Drizzle schema and additive Postgres migrations
packages/providers Provider catalog/adapters and capability normalization
packages/sdk       TypeScript connector for existing applications
packages/shared    Zod schemas and shared types
docs/mermaid       Canonical architecture sources
```

## Local development and verification

Use the Node/pnpm versions selected by the lockfile and current handoff, plus an isolated PostgreSQL database. These startup commands assume that database is initialized: apply the eight `packages/db/drizzle/*.sql` files in filename order, then `packages/db/migrations/001_portfolio.sql`, once as the schema administrator. The runtime role must have schema USAGE and table SELECT/INSERT/UPDATE/DELETE, without schema CREATE, table ownership or TRUNCATE. `db:push` alone does not install the account/usage migration.

The historical `.env.example` is not a complete launch configuration. Supply environment variables to each process explicitly (the gateway loads the root `.env`; Next uses its own environment). Both need `DATABASE_URL`, a verified `DATABASE_SSL_CA_FILE`, `BLINDSPOT_AUTH_ENABLED=1`, `BLINDSPOT_MOCK_MODE=1`, and the same independently generated `BLINDSPOT_BRIDGE_SECRET` of at least 32 characters. For loopback development only, `DATABASE_SSL=disable` is accepted instead of a CA. The dashboard also needs an independent `AUTH_SECRET` of at least 32 characters, matching `APP_ORIGIN`/`AUTH_URL` such as `http://localhost:3001`, and `BLINDSPOT_GATEWAY_URL=http://localhost:8787`. The gateway needs its own 64-character lowercase hexadecimal `ENCRYPTION_KEY`, `BLINDSPOT_EVAL_MODE=inline`, and `BLINDSPOT_INTERNAL_GATEWAY_URL=http://localhost:8787`. Keep all provider-key variables absent in development. Use the same browser hostname as `APP_ORIGIN`; localhost and 127.0.0.1 are different origins. Redis is unused in inline mode.

```bash
pnpm install --frozen-lockfile
pnpm --filter @blindspot/sdk build
pnpm start:gateway
pnpm start:dashboard
```

Run gateway and dashboard in separate terminals. For an integrated production build alongside a running baseline, use `BLINDSPOT_DIST_DIR=.next-integrated pnpm --filter @blindspot/dashboard build` so the baseline build directory is preserved.

For a local agent, set its `BLINDSPOT_BASE_URL` to `http://localhost:8787` and supply its separately minted SDK key. The deployed same-origin `/v1` edge routing is an AWS proxy configuration, not a Next development-server rewrite. The hosted Connect snippets use the named public origin; do not substitute the private container hostname in an external agent.

The original provider-blocked baseline passed the normal SDK/gateway/evaluation journey and 28 HTTP checks. Twelve focused client tests cover identity races, payload bounds and prepared display labels. Integrated local browser checks passed signup, full-navigation signout/signin, genuine SDK-ingested prepared evidence, Monitor, desktop dark and 390 px light layouts with no console errors. The compiled Auth.js/Server Action harness passed 26 checks across 45 requests; 19 real-PostgreSQL checks also passed. Live HTTP acceptance passed 13 check groups across 33 requests with two separate accounts, unchanged zero usage for the prepared examples and revoked temporary SDK keys. Root browser verified the live workspace, both themes, 390 px layout and a clean console.

```bash
pnpm exec tsx --test apps/dashboard/tests/client-*.test.ts apps/dashboard/tests/prepared-name.test.ts
pnpm typecheck
pnpm test:auth-origin
pnpm test:eval-plan
pnpm test:metrics
```

These checks require their documented isolated fixtures; none is permission to call a paid provider. The recurring loop remains off.

## Paid verification scope

One ordinary SDK completion through the deployed gateway returned HTTP 200 on 1 October 2026, 08:55:23.449–08:55:25.639 UTC. OpenAI `gpt-4o-mini` returned 16 input and 5 output tokens (21 total), with an estimated cost of **USD 0.0000054**, not an invoice. There was one completion and no automatic retry, judge, evaluation or golden-generation request. The shipped SDK then persisted its metadata span; the database audit matched the usage row, SDK key and project. Monitor displayed one execution, about 2.1 seconds and the rounded cost 0.001 cents (the stored amount is 0.00054 cents). This proves completion, telemetry and metering; it does not establish model quality or a production-safe model swap.

## Current limits

Shared-provider lifetime allowances are USD 0.25 per owner and USD 2 across the app; they are not monthly budgets. Google sign-in and password recovery remain unavailable. Two low-severity AI SDK 4 dependency advisories remain: file-type handling and resource consumption. Current text-only inputs and bounded provider response transport reduce exposure; the packages are not claimed patched.

Evaluation currently runs inline. Durable worker retries, declared/static topology, semantic drift scheduling and large-scale operational guarantees are not shipped claims. Provider catalogs establish availability/capabilities, not funded credit balances. Golden-set generation, ordinary evaluation and replay can incur provider cost; the prepared example must remain explicitly fixture-only.

## Maintainer map

- [AGENTS.md](./AGENTS.md), [Handoff.MD](./Handoff.MD) and [Loop.MD](./Loop.MD): operating rules and verified checkpoints.
- [Blindspot-PRD.md](./Blindspot-PRD.md): original product contract; current portfolio launch instructions supersede historical auth/deployment proposals.
- [docs/ARCHITECTURE_FLOW.md](./docs/ARCHITECTURE_FLOW.md): established agent and evaluation semantics.
- [docs/PORTFOLIO-UI.md](./docs/PORTFOLIO-UI.md): current account boundary and design adoption.
- [packages/sdk/README.md](./packages/sdk/README.md): connector and instrumentation contract.
- [Learning.MD](./Learning.MD): root causes and preventive rules.

Render/invitation documents remain historical references. They are not instructions to copy old credentials or alter existing deployments.
