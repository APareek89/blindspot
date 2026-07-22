# Render deployment — verified 2026-07-22

## Live services

| Service | Render ID | URL | Verified source |
|---|---|---|---|
| Blindspot gateway | `srv-d9fi9ctaeets73c46540` | <https://blindspot-gateway.onrender.com> | `APareek89/blindspot` · app/auth baseline `9cdb7d9` |
| Blindspot dashboard | `srv-d9fi9ib7uimc73eogttg` | <https://blindspot-dashboard.onrender.com> | `APareek89/blindspot` · handoff baseline `1915846` |
| GSTPilot test app | `srv-d9a9kdmcjfls739fqbu0` | <https://gstpilot.onrender.com> | GSTPilot `master` · `4b11365` |

All services use Render-provided `pnpm`; do not run `corepack enable` in the read-only runtime.
Blindspot remains a free local-first prototype: evals run inline and Redis durability is Phase 8.
Render free-tier cold starts can briefly make the dashboard's gateway proxy return 502. Treat that
as service availability, not a failed key; retry/warm-service UX and monitoring remain P1 work.

## Blindspot service configuration

Secret values are not recorded. Gateway environment-variable names:

```dotenv
DATABASE_URL=
ENCRYPTION_KEY=
BLINDSPOT_DEFAULT_MODEL=
BLINDSPOT_EVAL_MODE=inline
JUDGE_MODEL=
GOLDEN_MODEL=
COST_CAP_USD_PER_EVAL_RUN=
```

Dashboard:

```dotenv
BLINDSPOT_GATEWAY_URL=https://blindspot-gateway.onrender.com
```

Migration `0006_black_justice.sql` adds `blindspot.beta_feedback` and was applied additively to
Render's configured database. Future schema changes need an explicit production migration step;
running `db:push` against a developer `.env` does not change Render's database.

## Connect a hosted agent safely

Add a project-specific application key and these settings to the hosted app:

```dotenv
BLINDSPOT_API_KEY=<server-only application key>
BLINDSPOT_BASE_URL=https://blindspot-gateway.onrender.com
BLINDSPOT_ENVIRONMENT=production
BLINDSPOT_CAPTURE=metadata
BLINDSPOT_ROUTING=observe_only
```

Environment variables only configure the connector. The app must install the SDK, initialize
`Blindspot.fromEnv()`, wrap its shared model-call helper, close one root span at the real request
boundary and flush. Start with metadata/observe-only: no prompts or outputs are sent, and Blindspot
cannot change the app's model. Full invitation and code instructions: [`BETA_ONBOARDING.md`](./BETA_ONBOARDING.md).

## GSTPilot production proof and topology meaning

GSTPilot vendors `@blindspot/sdk` 0.1.0 inside its own repository, so Render no longer depends on a
sibling developer folder. Its live service has all five Blindspot variable names above and builds
from a frozen lockfile.

The final harmless request was:

> For a Delhi service business with INR 5 lakh annual turnover, is GST registration required only
> because one client is in another state?

GSTPilot returned a completed T1 answer. Blindspot's `gstpilot / production` workflow then showed:

- executions: `1 → 2`; nodes: `1 → 3`; latest-seen advanced to the request time;
- `pipeline` — agent root, 2 spans, 0 errors;
- `intake` — generation, `anthropic:claude-haiku-4-5-20251001`, 1 span, 0 errors;
- `fill-slots:registration_threshold` — generation, the same Haiku model, 1 span, 0 errors;
- post-request GSTPilot Blindspot warnings: 0; gateway workflow-ingest failures: 0.

This is observation evidence only. Managed resolution and protected workflow replay remain disabled
until GSTPilot supports a request-scoped model override at every generation boundary.

As of the verified metadata read on 2026-07-22:

| GSTPilot environment | Executions | Distinct observed nodes | Last observed (UTC) |
|---|---:|---:|---|
| production | 2 | 3 | 2026-07-21 09:05:22 |
| development | 5 | 7 | 2026-07-21 05:56:44 |

These counts do not describe GSTPilot's full code graph. Blindspot stores the distinct node names
that the SDK actually emitted and the environment actually executed. Production currently observed
`pipeline`, `intake` and `fill-slots:registration_threshold`; development exercised additional
generation paths. GSTPilot wraps the root agent and shared LLM helper, but not every deterministic
router/retrieval/calculator function. The first production root-only execution also predated the
child-span ingest fix and was not backfilled.

The next product correction is a declared topology manifest plus declared/development/production
coverage, accompanied by explicit deterministic/tool/retrieval instrumentation. Until then, UI and
documentation must say **observed nodes**.

## Hosted verification

- Gateway `/healthz` returned 200 with API `0.1.0` and features `workflow-spans-v2`, `beta-feedback`.
- Authenticated `/v1/beta-feedback` returned 200 against Render's migrated database.
- Dashboard `/login` and `/blindspot-sdk-0.1.0.tgz` returned 200; the asset SHA-256 matched
  `7d7c0fbfa54c3cb62c74da77520214264b54affd4fac46178b50fdbf8e3200a2`.
- Hosted Chromium QA proved same-origin `Origin: null` project-key sign-in returns 303, sets one
  secure httpOnly cookie and opens `/connect`; cross-site/missing-origin attempts remain 403.
- Signed invite signup, session persistence across all dashboard tabs and POST-only logout are live.
- Current auth is Blindspot invite/project-key access, not Supabase Auth.

## Pending credential rotation

A diagnostic previously exposed the old GSTPilot production project cookie in tool output. A
replacement key was minted, verified and stored locally without printing it, but the hosted GSTPilot
service still uses the old key to avoid an outage. The previously supplied Render API token no longer
works. Manually replace GSTPilot's `BLINDSPOT_API_KEY` in Render, save/deploy, verify a new production
request arrives, then revoke the old key. Never paste either key into chat, logs or this document.
