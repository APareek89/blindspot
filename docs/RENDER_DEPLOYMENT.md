# Render deployment — 2026-07-21

## Live services

| Service | Render ID | URL | Health check |
|---|---|---|---|
| Gateway | `srv-d9fi9ctaeets73c46540` | <https://blindspot-gateway.onrender.com> | `GET /healthz` |
| Dashboard | `srv-d9fi9ib7uimc73eogttg` | <https://blindspot-dashboard.onrender.com> | `GET /login` |

Both services run the `main` branch from `APareek89/blindspot`. The verified deployment is commit
`dd8eced8b9a1ce52e11b9cf10f7700928cf81c15`. The free local-first prototype uses inline evals and no
Redis; keep the first paid hosted run to one or two examples because a durable BullMQ worker is Phase 8.

## Blindspot service configuration

Secret values are never recorded here. The gateway has these environment-variable names configured:

```dotenv
DATABASE_URL=
ENCRYPTION_KEY=
BLINDSPOT_DEFAULT_MODEL=
BLINDSPOT_EVAL_MODE=inline
JUDGE_MODEL=
GOLDEN_MODEL=
COST_CAP_USD_PER_EVAL_RUN=
```

The dashboard has:

```dotenv
BLINDSPOT_GATEWAY_URL=https://blindspot-gateway.onrender.com
```

## Connect a hosted agent app safely

Start in observe-only, metadata-only mode. Add these variables to the agent application's Render
service, using a project key created in Blindspot Settings:

```dotenv
BLINDSPOT_API_KEY=<project key; never expose to browser code>
BLINDSPOT_BASE_URL=https://blindspot-gateway.onrender.com
BLINDSPOT_ENVIRONMENT=production
BLINDSPOT_CAPTURE=metadata
BLINDSPOT_ROUTING=observe_only
```

Capture is a user decision: `metadata` stores timing/model/token/error metadata, `inputs` also stores
inputs, and `full` also stores outputs. Move beyond `metadata` only after the user approves the data
policy. Observe-only records the app's actual model without allowing Blindspot to alter execution.

Environment variables alone do not emit traces. The deployed app must install the Blindspot SDK and
wrap its shared model-call boundary with `workflow()` / `span()` instrumentation. For GSTPilot, the
current local integration still links the SDK through a sibling filesystem path, so its hosted Render
build needs a separate GSTPilot-repository checkpoint before these variables can produce telemetry.

Only after that checkpoint should managed routing and protected workflow replay be enabled:

```dotenv
BLINDSPOT_ROUTING=managed
BLINDSPOT_REPLAY_SECRET=<new app-owned random secret; not the project key>
```

Configure the same replay secret in Blindspot Workflows and point the callback to the hosted app's
authenticated replay endpoint. Blindspot still creates an evidence-backed Recommendation; it never
silently changes the production model unless the route's explicit auto-approve policy is enabled.

## Verified checks

- Gateway `/healthz` returned `200` with `{ "ok": true, "service": "gateway" }`.
- Dashboard `/login` returned `200`; `/` redirected unauthenticated requests to `/login`.
- The rotated local GSTPilot project key authenticated against the hosted gateway as `Local Dev`.
- Hosted `/v1/workflows` returned the existing `gstpilot` workflow.
- An authenticated dashboard request to `/routes` returned `200` and rendered `Routes & Models`.
