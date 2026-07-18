# Loop.MD — Blindspot
status: off
# First working draft VERIFIED LIVE 2026-07-16 (Groq + live Postgres). User: keep Loop OFF (paid eval runs cost money) — re-offer if asked.
# Live results: #1 routing+trace ✅ · #3 golden agent ✅ · #4 eval+recommend(evidence) ✅ · #5 approve→live swap ✅
#              · #6 drift detected ✅ + CI gate 422 on sub-bar model ✅. (#2 auto-create ✅ implicit, #7 secret-safety by design.)

> AGENT INSTRUCTION — read every session and obey:
> - While `status: waiting_for_first_draft`: the moment the first working draft exists
>   (core path runs end-to-end once — demo-able, not just compiling), ASK the user:
>   "First draft is working. Want me to turn on the Loop? I'll run every eval below
>   after each change, show per-eval pass/fail, and keep finetuning until they pass."
>   Set `status: offered` when asked; `on` or `off` per the answer. Re-ask an
>   unanswered `offered` once at next session start.
> - While `status: on`: after each meaningful change run cheapest checks first
>   (typecheck/tests), then execute EVERY eval below for real (run the app — never
>   predict from code), report a per-eval ✅/❌ table including regressions, fix, repeat.
> - Paid/slow checks: write a one-line hypothesis in the run journal BEFORE running;
>   reproduce failures as free checks; one paid confirmation per hypothesis.

## Goal
Blindspot resolves `route:<name>` → the route's **approved** model, calls the real provider
through the user's own (encrypted) key, traces cost/latency/output, evals candidates against a
golden set, and surfaces **approval-gated recommendations with evidence** — never switching a
live model silently. **Done (v1, PRD DoD):** connect a real app → routes + traces appear → give
a route a golden set (upload or agent) → get an eval-backed recommendation → approve it → the
live model switches → a simulated version bump produces a drift recommendation, live on Render.

## Evals
<Drafted from the PRD — EDIT to make them yours: tighten thresholds, add real inputs/outputs.
These are the yardstick the loop finetunes against.>

| # | Input (action / call) | Expected (behavior / output) |
|---|-----------------------|------------------------------|
| 1 | POST an OpenAI-compatible completion with `model: "route:summarizer"` to the gateway | Resolves to the route's approved `live_model`, calls the provider via the user's key, returns a valid completion, and writes a `traces` row (cost, latency, output). |
| 2 | Call `model: "route:brand-new"` for a route that doesn't exist yet | A new route is auto-created with the default policy and shows up in Routes & Models; the call still succeeds. |
| 3 | A route with **no uploaded golden set**, only a task description | Golden Set Agent generates ≥20 diverse examples, each with a `reference_output` + rubric; origin badge = `agent`. |
| 4 | Add a cheaper candidate, calculate an eval plan, then explicitly confirm its disclosed cap/cases | Candidate addition spends nothing. Confirmation runs only the immutable plan; if complete evidence passes the bar at lower cost, a **Recommendation with evidence** (per-criterion scores, cost/latency delta, 3 side-by-side samples) appears in Approvals. `live_model` is **unchanged**. |
| 5 | Approve, then (separately) reject a pending Recommendation | Approve → `routes.live_model` updates to the new model. Reject → `live_model` unchanged, status=`rejected`, reason stored. |
| 6 | Simulate a provider version bump that drops a live model's score below its band | A `drift_event` + an approval-gated Recommendation are created; the live model is **NOT** auto-reverted unless that route opted into auto-approve. Real paid drift/CI paths remain 409 until Phase 8 consumes an approved plan. |
| 7 | (negative — security) Inspect stored provider keys via API/logs | Keys are encrypted at rest (AES-256-GCM); no endpoint or log line ever returns/prints a raw key value. |

## Run journal (paid/slow checks only)
| Date | Hypothesis (changed X, expect eval N to flip because W) | Result |
|------|----------------------------------------------------------|--------|
