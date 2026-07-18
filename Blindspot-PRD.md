# Blindspot — PRD + Claude Code Build Guide

**Version:** 1.1 · **Owner:** Anand Pareek · **Status:** Agent-workspace prototype approved 2026-07-18
**One-liner:** *Blindspot is the improvement workspace for a built AI agent: connect any workflow, understand every model-powered node, test only technically compatible models against user-owned golden sets, and surface **evidence-backed recommendations the user approves**, never a silent switch.*
**Why the name:** the whole product exists to reveal the **blind spot** every agent team has — the silent quality regression you can’t see until users complain.

> Design reference: `docs/blindspot-agent-workspace-vision.html` in the original concept repo.
> Runtime architecture expansion approved 2026-07-18: SDK/OTel observation, workflow discovery,
> normalized model registry, node-level compatibility, budget-aware eval sampling.

---

## 0. HOW CLAUDE CODE SHOULD USE THIS DOCUMENT (read first)

> **a) ALIGN THE ARCHITECTURE WITH ME BEFORE WRITING ANY CODE.**
> Read this whole PRD, then: (1) restate the architecture + the core objects back to me in your own words; (2) confirm tech choices (language, MCP/gateway approach, queue, DB) and flag anything you’d do differently; (3) print the **`.env` / secrets checklist** from §11 and confirm which providers I’m enabling for v1; (4) confirm the two non-negotiables — **swaps require my approval** (§3) and **golden sets have an upload-or-auto-generate lifecycle** (§7). **Do not scaffold until I reply “architecture approved.”**
> *(In parallel, I’m running the separate `SETUP-secrets-and-deps-prompt.md` in a second Claude Code session to gather keys — assume a `.env` will appear; read from it, never hard-code secrets.)*
>
> **b) EXECUTE PROMPTS ONE AT A TIME, TEACHING AS YOU GO.**
> Work through §12 one prompt at a time. **Before each step**, explain in *plain English first, then technical terms* — what you’re building, why, and how (e.g., “we’re adding a *gateway* so your app calls Blindspot instead of the model directly — technically an OpenAI-compatible proxy that resolves a route alias to a concrete model”). After each step: show the diff + a one-line “what changed / how to verify,” and **pause for my OK**. I want to *learn the stack* as we build.
>
> **c) COMPLETE UI/UX IS IN §10.** Build it to that spec.

---

## 1. Problem & purpose

Agent teams hard-code one model per call-site and never revisit it. Two costs follow: (1) **overspend** — simple steps pay frontier prices they don’t need; (2) **silent regressions** — when a provider ships a new model version, output quality can drift and no one notices until users complain. Existing tools split the job: gateways (Portkey/OpenRouter) route on *price*; eval tools (Langfuse/promptfoo) only *observe*. **Nobody makes the eval result gate the routing decision.** That seam is Blindspot.

**Portfolio purpose:** proves the #1 hiring separator (evals) fused with model-management + cost governance + a human-approval trust layer — the “P&L-owning PM who ships” story, in one runnable, load-tested product.

## 2. Core objects

| Object | Definition |
|---|---|
| **Route** | A named model call-site in the user’s agent (`summarizer`, `section-writer`). The unit of config + eval. |
| **Workflow** | A discovered agentic flow (for example `gstpilot/pipeline`) containing model and deterministic nodes. Discovery is read-only until the user selects it. |
| **Node** | One step inside a workflow. Model compatibility is evaluated per node, because a tool-using planner and a text summarizer have different requirements. |
| **Model registry** | Provider-discovered models normalized with capability, availability, pricing, version and deprecation metadata. |
| **Compatibility status** | `compatible`, `needs verification`, `needs provider key`, `incompatible`, or `eval failed`, with an explicit reason. |
| **Candidate pool** | Models allowed to run a route — frontier APIs + HuggingFace/open models, chosen from the **catalog** (§5). |
| **Policy** | The rule for the *ideal* model, e.g. “cheapest with score ≥ 0.85.” Policy produces a **recommendation**, not an automatic switch. |
| **Golden set** | Example inputs + reference/rubric defining “good” for a route. Uploaded or agent-generated; grows over time (§7). |
| **Judge** | A cheap LLM (Haiku/Gemini) scoring outputs against the golden set (LLM-as-judge). |
| **Drift** | Quality moving outside a route’s band — usually after a provider version bump. |
| **Recommendation** | An eval-backed proposal (“switch A→B: quality 0.87→0.86 within bar, cost −61%”) that the user **approves or rejects**. |
| **Gate** | The CI block: a regressing model/prompt change can’t reach production. |

## 3. DECISION BAKED IN — approval-gated swaps (with eval evidence)

**Blindspot never changes a live model silently.** When the policy finds a better/cheaper candidate that passes, *or* when drift degrades the live model, Blindspot creates a **Recommendation** carrying the full eval evidence (per-criterion scores, cost/latency delta, side-by-side output samples) and puts it in the **Approvals inbox**. The user clicks **Approve** (the route’s live model updates) or **Reject** (dismissed; the reason tunes future recommendations).

- **Default = approval required** for every swap. Trust + auditability first.
- **Advanced, per-route opt-in (default OFF):** “auto-approve when *within the quality band* **and** cost decreases” — lets a power user grant autonomy to specific low-risk routes. Every auto-action is still logged with its eval evidence.
- **Drift → always a recommendation**, never an auto-revert unless the route explicitly opted into auto-approve.

This is a *stronger* product stance than silent autonomy: **evidence-backed recommendations a human approves** is exactly what teams (and enterprises) trust.

## 4. User journey (worked example)

A user runs a LangGraph app (e.g., a lesson generator or a RAG assistant) that makes ~6 model calls per request, all hard-coded to one frontier model.
1. **Connect** — add the lightweight Blindspot SDK/OTel exporter for observe-only discovery, or point the model client at the Blindspot gateway when Blindspot should control routing. Environment variables configure identity; an SDK/proxy hook sends telemetry.
2. **Workflows appear** — users select which discovered workflow to improve; each generation node becomes an eval Route with its observed model, latency, tokens, errors and capability requirements.
3. **Choose candidate models** from the catalog (frontier + open/HF) per route.
4. **Give each route a golden set** — upload one, or let the **Golden Set Agent** write one (§7); set a policy.
5. **Blindspot evals + recommends** — back-tests candidates; simple routes get a “switch to a cheap model” recommendation with proof; the user approves.
6. **Ongoing** — on any provider version bump, Blindspot re-evals and, if quality drifts, sends an approval-gated recommendation; CI gates regressions. Result: 40–60% lower model cost, quality held, zero silent regressions.

## 5. Model catalog & onboarding (frontier + HuggingFace + BYO keys)

**The catalog = “models on the platform to choose from.”** A provider sync discovers models, then Blindspot normalizes and verifies them. The experiment selector defaults to technically compatible models; an “Excluded” view explains every omitted model. Spans:
- **A · Frontier APIs** — first prototype: Anthropic Claude Sonnet 4.6 vs Claude Haiku 4.5. Provider-list synchronization is account-specific.
- **B · HuggingFace open models** — added by model id, served via the **HF Inference API** (serverless, free tier — great for eval back-testing) or **Inference Endpoints** (dedicated/autoscaling). e.g. `Qwen/Qwen2.5-7B`, `meta-llama/Llama-3.3-70B`.
- **C · Aggregators / local** — first additional adapter: Fireworks AI; later OpenRouter/Together or Ollama/vLLM.

Each catalog entry shows typical cost/quality/latency; **adding one to a route triggers a back-test on that route’s golden set**, so the score shown is real for *that task*.

**Compatibility is two gates:** (1) technical eligibility checks modality, tool calling,
structured output, streaming, context, adapter and account access; (2) behavioral eligibility
requires the model to pass that node's golden-set quality bar. A technical pass permits an
experiment, never a live swap.

**Access model (who pays the provider):**
- **BYO keys (v1 — build this):** the user stores their own provider keys (encrypted at rest); Blindspot routes through them. Zero markup, user controls spend, simplest. Providers are **pluggable adapters** behind one interface.
- **Managed (future):** Blindspot proxies through its own accounts (OpenRouter-style) + unified billing — no user keys needed. Roadmap only.

## 6. The loop: Observe → Eval → Recommend → Approve → Route → Gate
Observe (trace every call: cost/latency/output) → Eval (judge scores the golden set, on schedule + on any model-version change) → **Recommend** (policy proposes the best/cheapest passing model *with evidence*) → **Approve** (user accepts/rejects) → Route (apply the approved model) → Gate (block CI on regressions).

## 7. DECISION BAKED IN — golden dataset lifecycle (upload → agent → grow → curate)

The golden set is a **living asset**, not a one-time upload. Per route:

- **Seed — two paths:**
  - **Upload (optional):** the user uploads a golden set (CSV/JSONL: `input`, optional `reference_output`, optional `rubric`). Validated + previewed.
  - **Agent-generate (if no upload):** a **Golden Set Agent** builds an initial set — it samples recent route inputs from traffic (or, cold-start, synthesizes representative inputs from the route’s task description), clusters them for diversity, and generates a `reference_output` + rubric per example using a strong model. The user starts with ~20–50 examples even with zero upload.
- **Grow (human-curated):** Blindspot continuously **proposes** new golden candidates from production — prioritizing *judge-uncertain* outputs, *drift-flagged* cases, and *diverse/edge* inputs — into a “suggested additions” queue. The user accepts/edits/rejects, so the set grows without going stale or noisy.
- **Curate (full control):** **add / edit / delete** any entry; mark/replace the reference output; label pass/fail; **promote a production trace** into the golden set in one click; version the set (so score history is comparable). Deleting entries is always allowed.

**Why it matters:** most eval tools make you hand-build the set and it rots. Blindspot’s upload-optional + agent-authored + production-grown loop is a genuine differentiator and removes the biggest reason teams skip evals.

### 7a. DECISION BAKED IN — transparent eval budgets and sampling

Before a paid run, Blindspot estimates the full cost from selected golden examples × selected
models × repetitions × measured/estimated tokens (candidate calls plus judge calls). The user sets
the spend cap. If the cap is below the full-run estimate, Blindspot proposes a reproducible
stratified sample: preserve must-pass and known-failure cases first, then edge cases, then a diverse
representative sample from the remaining set. The UI states exactly what runs, what is omitted,
the seed, and the confidence limitation. It never silently samples or exceeds the cap.

## 8. Architecture (scale-ready — “scales by adding instances”)
```
User agent ──(gateway: base_url→route | SDK/OTel: spans)──▶ BLINDSPOT GATEWAY (stateless · N instances)
                                                                │ resolve route→approved model (policy)
                                            ┌───────────────────┼─────────────────────┐
                                            ▼                    ▼                     ▼
                                      live LLM call        enqueue eval run       Redis (cache · rate-limit)
                                    (frontier/HF/aggr,        │
                                     via user’s keys)         ▼
                                                     EVAL WORKERS (M instances)
                                                     golden set → judge → score → drift check → Recommendation
                                                                  │
                                                                  ▼
                                                     Postgres (routes · scores · golden sets · recs · drift history)
```
Stateless gateway (scale by instance count) · eval runs are the bursty/slow work → decoupled into workers via a queue · idempotent jobs · DLQ · per-key rate limiting · `render.yaml` autoscaling · `/healthz` · OpenTelemetry + Sentry · **user provider keys encrypted at rest** (BYO).

## 9. Data model (Postgres)
`projects(id, user, name, capture_mode)` · `workflows(id, project_id, name, framework, environment, selected, first_seen, last_seen)` · `workflow_nodes(id, workflow_id, route_id, name, kind, latest_model, requirements_json)` · `workflow_executions(id, workflow_id, external_id, session_id, status)` · `workflow_spans(id, execution_id, node_id, model, capture_mode, input/output?, tokens, cost, latency, error)` · `routes(id, project_id, name, live_model, policy_json, auto_approve bool)` · `model_registry(id, project_id, provider, model_ref, availability, capabilities_json, pricing, probe/sync timestamps)` · `candidates(id, route_id, model_ref, source[api|hf|aggregator|local], enabled)` · `golden_sets(id, route_id, version, origin[upload|agent|grown])` · `golden_examples(id, golden_set_id, input, reference_output, rubric, label, active)` · `eval_plans(id, project_id, route_id, golden_set_id, models, judge, budget, estimate, disclosed sample/seed/hash, status, expiry, actual cost)` · `eval_runs(id, plan_id, route_id, model_ref, golden_set_version, status, avg_score, example counts, estimated/actual cost, latency, seed)` · `eval_example_results(id, eval_run_id, golden_example_id, input/reference/output, score, criteria, reasoning, issues, candidate/judge cost, error)` · `recommendations(id, route_id, from_model, to_model, evidence_json, status[pending|approved|rejected], created_at)` · `drift_events(id, route_id, model_ref, old_score, new_score, action)` · `provider_keys(id, project_id, provider, encrypted_key)` · `traces(id, route_id, model, input, output, cost, latency, created_at)`.

## 10. COMPLETE UI/UX (Blindspot agent-workspace design)
Dark, data-dense, Linear/Vercel-clean. Tokens: bg `#0B0D10`, card `#14171C`, accent `#635BFF`, pass `#2FBF71`, warn `#E0A32E`, danger `#E5484D`, cyan `#3DB7C0`.
Sidebar nav: **Overview · Workflows · Routes & Models · Approvals · Drift · Golden Sets · Connect · Settings.**

1. **Overview** — KPIs: *Avg quality*, *$ saved (realized)* + *$ saved (pending approval)*, *Pending approvals*, *Drift alerts*, *Routes healthy/at-risk*. Cost-vs-quality chart; activity feed.
2. **Routes & Models** — table (route · live model · quality sparkline · cost/1k · policy · status). Click → **route detail**: candidate pool (add from catalog / remove, each with back-tested score/cost/latency/status), policy editor, per-route auto-approve toggle (default OFF), score-over-time chart with version markers.
3. **Approvals** (the decision surface) — a queue of eval-backed **Recommendations**: “Switch `summarizer` gpt-4o-mini → gemini-flash · quality 0.87→0.86 (≥ bar) · cost −61% · [View evidence] [Approve] [Reject].” Evidence drawer: per-criterion scores, cost/latency delta, side-by-side output samples on 3 golden examples.
4. **Drift** — timeline of version-bump events; each links to its Recommendation.
5. **Golden Sets** (per route) — origin badge (uploaded / agent-generated / grown); a table of examples with **add / edit / delete**, label pass/fail, “generate more with agent,” “promote a production trace,” version selector; judge config; run history; CI-gate status. Empty state → “Upload a golden set (CSV/JSONL) or let Blindspot write one.”
6. **Connect** — gateway + SDK snippets; project data controls (`metadata`, `inputs`, `full`); “what happens after you connect.”
7. **Settings** — providers & **BYO keys** (encrypted), catalog, cost caps, CI-gate token.
States to design: empty (no route), no-golden-set (offer upload/agent), pending-approval, drift-active, back-testing-in-progress.

## 11. `.env` / SECRETS CHECKLIST (Claude Code: print & confirm; the parallel setup session will fill it)
**Required (Claude-first prototype):**
- `ANTHROPIC_API_KEY` — Claude Sonnet 4.6 and Haiku 4.5.
- `JUDGE_MODEL=anthropic:claude-haiku-4-5-20251001` — cheap Claude judge.
- `BLINDSPOT_DEFAULT_MODEL=anthropic:claude-sonnet-4-6` — observed route fallback.
- `GOLDEN_MODEL=anthropic:claude-sonnet-4-6` — agent-generated golden examples.
- `DATABASE_URL` — Postgres (Supabase/Render/Neon). · `REDIS_URL` — queue + cache (Render KV/Upstash).
- `ENCRYPTION_KEY` — 32-byte key to encrypt stored user provider keys at rest.

**Optional candidate providers:** `HF_TOKEN` · `FIREWORKS_API_KEY` (adapters wired; only
models that pass the node compatibility gate may enter an experiment).

**Gateway / multi-tenant:**
- `BLINDSPOT_GATEWAY_URL`, generated per-project `bs_live_…` keys (app-issued, not in `.env`).
- `OAUTH_ISSUER`/`OAUTH_CLIENT_ID`/`OAUTH_CLIENT_SECRET` — only if publishing multi-tenant.

**Ops (free tiers):** `SENTRY_DSN` · `OTEL_EXPORTER_OTLP_ENDPOINT` · `COST_CAP_USD_PER_EVAL_RUN`.
> Never print secret values; provide a committed `.env.example` with blank keys.

**Agent app connector:** `BLINDSPOT_API_KEY` · `BLINDSPOT_BASE_URL` ·
`BLINDSPOT_ENVIRONMENT` · `BLINDSPOT_CAPTURE[metadata|inputs|full]`.

## 12. BUILD SEQUENCE (Claude Code: one prompt at a time, teach-as-you-go per §0b)
**Phase 0 — Align & scaffold.** Restate architecture; print `.env` checklist; confirm the two decisions; wait for “architecture approved.” Scaffold: gateway service + dashboard (Next.js) + Postgres schema (§9) + Redis + queue + `/healthz`.
**Phase 1 — Gateway & routes.** OpenAI-compatible gateway that resolves `route:<name>` → a model via a provider adapter (start with one provider, BYO key, encrypted). Auto-create routes from traffic. Trace every call.
**Phase 2 — Golden sets.** Upload (CSV/JSONL) + validation; the **Golden Set Agent** (synthesize inputs + reference/rubric); CRUD (add/edit/delete/version); “promote a trace.”
**Phase 3 — Eval engine.** LLM-as-judge scores a route’s golden set; store `eval_runs`; back-test a candidate on add.
**Phase 4 — Recommendations & approvals.** Policy → generate a Recommendation with evidence; the **Approvals inbox**; approve/reject → update `live_model`; per-route auto-approve toggle.
**Phase 5 — Drift & gate.** Scheduled + version-triggered re-evals → drift events → recommendations; a CI endpoint that blocks a regressing change.
**Phase 6 — Catalog & providers.** Model catalog (frontier + HF via `HF_TOKEN` + aggregators); add-from-catalog with back-test.
**Phase 7 — Dashboard.** Build §10 screens (Connect + Approvals + Golden Sets first — they carry the demo).
**Phase 8 — Scale & observability.** Queue workers, DLQ, idempotency, rate limits, `render.yaml` autoscaling, OTel + Sentry, k6 load test, `SCALING.md`.
**Phase 9 — Ship.** Tests + a tool/eval suite (does the judge agree with human approvals?), README + Loom, deploy to Render.

**Agent-workspace prototype expansion (approved 2026-07-18; one checkpoint at a time):**
- **Phase 7A — Connect + Observe.** TypeScript SDK, authenticated span ingestion, workflow/node discovery, workflow selection, data controls. Test shape: gstpilot.
- **Phase 7B — Registry + Compatibility (built 2026-07-18).** Anthropic account model sync; Sonnet 4.6 vs Haiku 4.5; normalized capability matrix and read-only access probes. HF + Fireworks adapters stay pluggable.
- **Phase 7C — Quality + Experiment (built locally 2026-07-18).** Context import, golden lifecycle, per-example outputs/issues, full cost estimate and transparent stratified sampling under a user cap.
- **Phase 7D — Continuous loop.** Selected-node monitoring, drift simulation, debug evidence and approval-gated recommendation/application.

## 13. Success metrics
**Portfolio:** a live demo where connecting an app → routes appear → approve a recommendation → cost drops with quality held → a simulated version bump triggers a drift recommendation. **Product:** $ saved (realized), routes under management, recommendations approved, drift caught, golden-set growth, judge-vs-human agreement.

## 14. Out of scope (v1) / future
Out: managed/unified billing, fine-tuning, non-LLM evals. Future: managed access mode (no user keys), more providers, team roles, scheduled reports, an MCP interface so agents query Blindspot programmatically.

---
*Definition of done (v1): connect a real app → routes + traces appear → give a route a golden set (upload or agent) → get an eval-backed recommendation → approve it → the live model switches → a simulated version bump produces a drift recommendation — all on a live Render deployment. Start at §12 Phase 0 — after the §0a alignment.*
