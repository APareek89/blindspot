# Blindspot — PRD + Claude Code Build Guide

**Version:** 1.3 · **Owner:** Anand Pareek · **Status:** Hosted beta + Claude takeover synced 2026-07-22
**One-liner:** *Blindspot is the improvement workspace for a built AI agent: connect any workflow, understand every model-powered node, test only technically compatible models against user-owned golden sets, and surface **evidence-backed recommendations the user approves**, never a silent switch.*
**Why the name:** the whole product exists to reveal the **blind spot** every agent team has — the silent quality regression you can’t see until users complain.

> Design reference: `docs/blindspot-agent-workspace-vision.html` in the original concept repo.
> Runtime architecture expansion approved 2026-07-18: SDK/OTel observation, workflow discovery,
> normalized model registry, node-level compatibility, budget-aware eval sampling.
> Evidence semantics corrected 2026-07-21: observe-only vs managed application, model-only
> screening vs protected workflow replay, visible criterion-mean scoring, explicit context consent,
> and real-vs-simulated drift separation.
> Takeover semantics corrected 2026-07-22: current node inventory is observed runtime telemetry,
> invite/project-key access is not Supabase Auth, and Phase 8 durability remains unbuilt.

---

## 0. HOW CLAUDE CODE SHOULD USE THIS DOCUMENT (read first)

> **a) THE ARCHITECTURE IS ALREADY APPROVED (2026-07-16).**
> For a takeover, read `AGENTS.md`, `Handoff.MD`, `Loop.MD`, this PRD and
> `docs/ARCHITECTURE_FLOW.md`; reconcile the handoff SHA; then continue the listed next work. Do not
> restart Phase 0, scaffold a replacement, or re-litigate the stack. Ask for approval only when a
> proposed change alters the architecture or one of the two non-negotiables. Read secrets from the
> existing git-ignored `.env`; never print or hard-code them.
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
| **Route** | A named **model-generation call-site** in the user’s agent (`summarizer`, `section-writer`). It never represents deterministic code. The unit of model config + eval. |
| **Workflow** | An environment-scoped agentic flow (for example `gstpilot / production`). Today it is discovered from ingested spans and is read-only until the user selects it. |
| **Observed node** | A step actually instrumented and executed in that environment: agent, generation, retrieval, tool or deterministic function. Only observed generation nodes become Routes. This is not yet the app's complete static topology. |
| **Declared topology** | Planned startup manifest of expected nodes/edges. It will allow coverage comparisons such as declared, observed in development, observed in production and never seen. It is not implemented yet. |
| **Model registry** | Provider-discovered models normalized with capability, availability, pricing, version and deprecation metadata. |
| **Compatibility status** | `compatible`, `needs verification`, `needs provider key`, `incompatible`, or `eval failed`, with an explicit reason. |
| **Candidate pool** | Models allowed to run a route — frontier APIs + HuggingFace/open models, chosen from the **catalog** (§5). |
| **Policy** | The rule for the *ideal* model, e.g. “cheapest with score ≥ 0.85.” Policy produces a **recommendation**, not an automatic switch. |
| **Golden set** | Example inputs + reference/rubric defining “good” for a route. Uploaded or agent-generated; grows over time (§7). |
| **Eval execution mode** | `model_only` directly calls a candidate for screening; `workflow_replay` runs the protected real app with a temporary target-node override and is required for production Recommendations. |
| **Judge** | A cheap LLM (Haiku/Gemini) scoring outputs against the golden set (LLM-as-judge). |
| **Drift** | Quality moving outside a route’s band — usually after a provider version bump. |
| **Recommendation** | An eval-backed proposal (“switch A→B: quality 0.87→0.86 within bar, cost −61%”) that the user **approves or rejects**. |
| **Gate** | The CI block: a regressing model/prompt change can’t reach production. |

## 3. DECISION BAKED IN — approval-gated swaps (with eval evidence)

**Blindspot never changes a live model silently.** A production Recommendation requires complete
same-plan workflow-replay evidence for the live and candidate models. It carries per-criterion
scores, cost/latency delta and side-by-side samples into the **Approvals inbox**. On a managed
connection, Approve updates the route after a stale-baseline check. On an observe-only connection,
Approve means **awaiting application rollout** and Blindspot never claims the app changed.

- **Default = approval required** for every swap. Trust + auditability first.
- **Advanced, per-route opt-in (default OFF):** “auto-approve when *within the quality band* **and** cost decreases” — lets a power user grant autonomy to specific low-risk routes. Every auto-action is still logged with its eval evidence.
- **Drift → always a recommendation**, never an auto-revert unless the route explicitly opted into auto-approve.

This is a *stronger* product stance than silent autonomy: **evidence-backed recommendations a human approves** is exactly what teams (and enterprises) trust.

## 4. User journey (worked example)

A user runs a LangGraph app (e.g., a lesson generator or a RAG assistant) that makes ~6 model calls per request, all hard-coded to one frontier model.
1. **Connect** — add the lightweight SDK for observe-only discovery (default), enable SDK managed resolution per generation node, or point an OpenAI-compatible client at the gateway. Capture mode and repository-context sharing are separate user decisions.
2. **Observed workflows appear** — users select which discovered workflow/environment to improve;
   each instrumented generation node becomes an eval Route with its observed model, latency, tokens,
   errors and capability requirements. Unexecuted or uninstrumented branches do not appear yet.
3. **Choose candidate models** from the catalog (frontier + open/HF) per route.
4. **Give each route a golden set** — upload one, or let the **Golden Set Agent** write one (§7); set a policy.
5. **Blindspot evals** — model-only runs shortlist candidates; protected workflow replay runs the real prompt, retrieval, tools and deterministic gates. Only complete replay-grade evidence can recommend a production switch.
6. **Ongoing** — on any provider version bump, Blindspot re-evals and, if quality drifts, sends an approval-gated recommendation; CI gates regressions. Result: 40–60% lower model cost, quality held, zero silent regressions.

## 5. Model catalog & onboarding (frontier + HuggingFace + BYO keys)

### 5a. Invite-only beta adoption

Before open signup, a Blindspot operator creates an expiring, recipient-and-project-bound signup
link. Its HMAC-signed token lives in the URL fragment so it is not sent in request/referrer logs. The
tester confirms the workspace once; Blindspot atomically creates separate shown-once recovery and
application keys, signs the browser in, and guides the tester through the versioned TypeScript
connector in `metadata + observe_only`. Connect confirms success only after a recent production
request is actually ingested. Context sharing, prompt/output retention, provider keys, paid evals and
managed routing are separate later decisions; accepting an invite does not enable any of them.
One signed email/project pair is concurrency-serialized. A lost creation response may recover the
same derived keys for five minutes; after that, the invite cannot reveal them again.

The beta distribution is intentionally simple: the dashboard serves an immutable-version SDK
tarball with a published SHA-256 checksum, and the dashboard provides a project-scoped structured
feedback form that never attaches application logs implicitly.
Uninvited/open signup, email/password identity, organization roles, billing, npm publication and a
native Python observability SDK are general-availability work, not claims of this beta.

**Identity decision still required:** the current beta is signed-invite + project-key access. The
user's desired general flow is signup-first human identity, likely Supabase Auth. Do not imply that
Supabase Auth is integrated; align account, organization and key-scope semantics before building it.

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
Observe (all **instrumented** node kinds; content only at the selected capture level) → Eval (model-only screening or
real workflow replay) → score as the visible equal-weight criterion mean → **Recommend** only from
complete replay evidence → **Approve** → apply on managed connections or mark awaiting rollout on
observe-only connections → monitor operational and golden-eval drift.

## 7. DECISION BAKED IN — golden dataset lifecycle (upload → agent → grow → curate)

The golden set is a **living asset**, not a one-time upload. Per route:

- **Seed — two paths:**
  - **Upload (optional):** the user uploads CSV, JSON or JSONL (`input`, optional `reference_output`, optional `rubric`, optional `label`). Validated + previewed.
  - **Agent-generate (if no structured upload):** a **Golden Set Agent** builds an initial set from a task plus user-selected Markdown/text documents, an explicitly shared application manifest, or explicitly consented retained live inputs. Metadata-only capture cannot silently supply content.
- **Grow (human-curated):** Blindspot continuously **proposes** new golden candidates from production — prioritizing *judge-uncertain* outputs, *drift-flagged* cases, and *diverse/edge* inputs — into a “suggested additions” queue. The user accepts/edits/rejects, so the set grows without going stale or noisy.
- **Curate (full control):** **add / edit / delete** any entry; mark/replace the reference output; label pass/fail; **promote a production trace** into the golden set in one click; version the set (so score history is comparable). Deleting entries is always allowed.

**Why it matters:** most eval tools make you hand-build the set and it rots. Blindspot’s upload-optional + agent-authored + production-grown loop is a genuine differentiator and removes the biggest reason teams skip evals.

### 7a. DECISION BAKED IN — transparent eval budgets and sampling

Before a paid run, Blindspot estimates the full cost from selected golden examples × selected
models × repetitions × measured/estimated tokens (candidate calls plus judge calls). The user sets
the spend cap. If the cap is below the full-run estimate, Blindspot proposes a reproducible
stratified sample: preserve must-pass and known-failure cases first, then edge cases, then a diverse
representative sample from the remaining set. The UI states exactly what runs, what is omitted,
the seed, and the confidence limitation. It never silently samples or exceeds the cap. Each plan
also fixes the execution mode. The results UI shows Label, Input, Expected output, LLM output,
Score, visible formula and issues for every example.

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
Stateless gateway (scale by instance count) · eval runs are the bursty/slow work → decoupled into workers via a queue · idempotent jobs · DLQ · per-key rate limiting · `render.yaml` autoscaling · `/healthz` · OpenTelemetry + Sentry · **user provider keys encrypted at rest** (BYO).

This diagram is the approved scale target. The current local and Render beta runs evals inline and
does not require Redis. Durable BullMQ workers, DLQ/retry, rate limiting, OTel/Sentry and k6 are
Phase 8; documentation and UI must not describe them as live production guarantees.

## 9. Data model (Postgres)
`projects(id, user, name, capture_mode)` · `beta_feedback(project_id, stage, attempted, expected, actual, impact, framework, capture_mode)` · `workflows(id, project_id, name, framework, environment, selected, integration_mode, context_manifest/hash/shared_at, replay_url/encrypted_secret/enabled, first_seen, last_seen)` · `workflow_nodes(id, workflow_id, route_id, name, kind, latest_model, requirements_json)` (**currently observed-only**) · `workflow_executions(...)` · `workflow_spans(...)` · `routes(id, project_id, name, live_model, policy_json, auto_approve)` · `model_registry(...)` · `candidates(...)` · `golden_sets(...)` · `golden_examples(...)` · `eval_plans(..., execution_mode, disclosed sample/seed/hash, status, expiry, actual_cost)` · `eval_runs(..., execution_mode, score_method, avg_score, counts, costs, latency, seed)` · `eval_example_results(..., input/reference/candidate_output, score, criteria, reasoning, issues, candidate/judge cost, error)` · `recommendations(...)` · `drift_events(..., source[live_traffic|provider_version|golden_eval|simulation], action)` · `provider_keys(...)` · `api_keys(hash + prefix only)` · `traces(...)`. A declared-node/edge table is a planned topology addition, not current schema.

## 10. COMPLETE UI/UX (Blindspot agent-workspace design)
Dark, data-dense, Linear/Vercel-clean. Tokens: bg `#0B0D10`, card `#14171C`, accent `#635BFF`, pass `#2FBF71`, warn `#E0A32E`, danger `#E5484D`, cyan `#3DB7C0`.
Sidebar nav: **Overview · Workflows · Routes & Models · Approvals · Drift · Golden Sets · Connect · Settings.**

1. **Overview** — KPIs: *Avg quality*, *$ saved (realized)* + *$ saved (pending approval)*, *Pending approvals*, *Drift alerts*, *Routes healthy/at-risk*. Cost-vs-quality chart; activity feed.
2. **Routes & Models** — table (route · live model · quality sparkline · cost/1k · policy · status). Click → **route detail**: candidate pool (add from catalog / remove, each with back-tested score/cost/latency/status), policy editor, per-route auto-approve toggle (default OFF), score-over-time chart with version markers.
3. **Eval Results** (route tab) — one evidence table per run with label, user/task input, expected output, full candidate output, criterion-mean formula, per-criterion reasoning and explicit issues; clearly labels model-only vs workflow replay.
4. **Approvals** — evidence-backed Recommendations only; actions read “Approve & apply” for managed or “Approve recommendation” / “awaiting rollout” for observe-only.
5. **Drift** — separate live operational, consented live semantic and golden-eval lanes; simulations are developer-only and excluded from customer history/evidence.
6. **Golden Sets** — a four-step source → configure → review/publish → run wizard; structured upload plus Markdown/text context, connected-app context and live traces each have truthful availability/consent states; full CRUD/versioning remains above it.
7. **Connect** — observe-only vs managed SDK/gateway snippets, explicit `shareContext`, replay callback contract and project data controls.
8. **Settings** — providers & encrypted BYO keys, model catalog, cost caps and revocable hash-only gateway keys.
States to design: empty (no route), no-golden-set (offer upload/agent), pending-approval, drift-active, back-testing-in-progress.

## 11. `.env` / SECRETS CHECKLIST (Claude Code: print & confirm; the parallel setup session will fill it)
**Required (Claude-first prototype):**
- `ANTHROPIC_API_KEY` — Claude Sonnet 4.6 and Haiku 4.5.
- `JUDGE_MODEL=anthropic:claude-haiku-4-5-20251001` — cheap Claude judge.
- `BLINDSPOT_DEFAULT_MODEL=anthropic:claude-sonnet-4-6` — observed route fallback.
- `GOLDEN_MODEL=anthropic:claude-sonnet-4-6` — agent-generated golden examples.
- `DATABASE_URL` — Postgres (Supabase/Render/Neon).
- `ENCRYPTION_KEY` — 32-byte key to encrypt stored user provider keys at rest.

**Deferred for Phase 8:** `REDIS_URL` — queue/cache durability. It is not required while
`BLINDSPOT_EVAL_MODE=inline`.

**Optional candidate providers:** `HF_TOKEN` · `FIREWORKS_API_KEY` (adapters wired; only
models that pass the node compatibility gate may enter an experiment).

**Gateway / multi-tenant:**
- `BLINDSPOT_GATEWAY_URL`, generated per-project `bs_live_…` keys (app-issued, not in `.env`).
- `OAUTH_ISSUER`/`OAUTH_CLIENT_ID`/`OAUTH_CLIENT_SECRET` — only if publishing multi-tenant.

**Ops (free tiers):** `SENTRY_DSN` · `OTEL_EXPORTER_OTLP_ENDPOINT` · `COST_CAP_USD_PER_EVAL_RUN`.
> Never print secret values; provide a committed `.env.example` with blank keys.

**Agent app connector:** `BLINDSPOT_API_KEY` · `BLINDSPOT_BASE_URL` ·
`BLINDSPOT_ENVIRONMENT` · `BLINDSPOT_CAPTURE[metadata|inputs|full]` ·
`BLINDSPOT_ROUTING[observe_only|managed]`. A replay endpoint uses its own app-chosen shared secret;
it is stored encrypted in Blindspot and is never the project key.

## 12. BUILD SEQUENCE (Claude Code: one prompt at a time, teach-as-you-go per §0b)
**Phase 0 — Align & scaffold (DONE; approved 2026-07-16).** Gateway, dashboard, schema, queue wiring and `/healthz`. A takeover does not repeat this phase.
**Phase 1 — Gateway & routes.** OpenAI-compatible gateway that resolves `route:<name>` → a model via a provider adapter (start with one provider, BYO key, encrypted). Auto-create routes from traffic. Trace every call.
**Phase 2 — Golden sets.** Upload (CSV/JSONL) + validation; the **Golden Set Agent** (synthesize inputs + reference/rubric); CRUD (add/edit/delete/version); “promote a trace.”
**Phase 3 — Eval engine.** LLM-as-judge scores a route’s golden set; store `eval_runs`; back-test a candidate on add.
**Phase 4 — Recommendations & approvals.** Policy → generate a Recommendation with evidence; the **Approvals inbox**; approve/reject → update `live_model`; per-route auto-approve toggle.
**Phase 5 — Drift & gate.** Scheduled + version-triggered re-evals → drift events → recommendations; a CI endpoint that blocks a regressing change.
**Phase 6 — Catalog & providers.** Model catalog (frontier + HF via `HF_TOKEN` + aggregators); add-from-catalog with back-test.
**Phase 7 — Dashboard.** Build §10 screens (Connect + Approvals + Golden Sets first — they carry the demo).
**Phase 8 — Scale & observability.** Queue workers, DLQ, idempotency, rate limits, `render.yaml` autoscaling, OTel + Sentry, k6 load test, `SCALING.md`.
**Phase 9 — Ship (PARTIAL).** Tests, root README and Render deployment exist. Broad beta identity,
durability/observability, load testing, npm publication and Loom remain.

**Agent-workspace prototype expansion (approved 2026-07-18; one checkpoint at a time):**
- **Phase 7A — Connect + Observe.** TypeScript SDK, authenticated span ingestion, workflow/node discovery, workflow selection, data controls. Test shape: gstpilot.
- **Phase 7B — Registry + Compatibility (built 2026-07-18).** Anthropic account model sync; Sonnet 4.6 vs Haiku 4.5; normalized capability matrix and read-only access probes. HF + Fireworks adapters stay pluggable.
- **Phase 7C — Quality + Experiment (built and deployed).** Context import, golden lifecycle, per-example outputs/issues, full cost estimate and transparent stratified sampling under a user cap.
- **Phase 7D — Truthful evidence loop + beta access (built and deployed 2026-07-22).** Observe-only vs managed application, protected workflow replay, criterion-mean evidence table, comparable golden-eval drift, operational-signal collection, quarantined simulation, signed invite signup and project-key sessions. Automatic operational thresholds, consented live semantic scheduling, Supabase human identity and declared topology remain future work.

## 13. Success metrics
**Portfolio:** a live demo where connecting an app → all **instrumented/observed** nodes and model Routes appear → a budgeted
workflow replay produces transparent evidence → an approved managed Recommendation changes a route
or an observe-only one waits for rollout → a later real golden-eval regression raises drift evidence.
**Product:** realized/pending savings, routes under management, rollout completion, real drift caught,
golden-set growth and judge-vs-human agreement.

## 14. Out of scope (v1) / future
Out of the current prototype: managed/unified provider billing, fine-tuning execution, scheduled live
semantic judging and deterministic function evals. The next function-eval layer should reuse workflow
nodes and golden assets but run typed fixtures/invariants in a sandbox (exact/schema/property,
side-effect, latency, idempotency and security assertions) and produce code/test Recommendations,
not model-switch Recommendations. Future also includes more providers, team roles, reports and MCP.

---
*Definition of done (v1): connect a real app → observed workflow map + generation Routes appear → create a
versioned golden set → authorize a workflow-replay plan → inspect every input/output/score/issue →
approve a managed Recommendation or track an observe-only rollout → detect a real comparable-score
regression without polluting evidence with simulations — all on a live Render deployment.*
