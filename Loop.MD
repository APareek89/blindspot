# Loop.MD — Blindspot
status: off
# First working draft VERIFIED LIVE 2026-07-16. User chose Loop OFF because real model evals cost money; re-offer only when asked.
# Live history: routing+trace ✅ · golden agent ✅ · eval+recommend ✅ · approve→swap ✅ · drift/gate ✅.

> AGENT INSTRUCTION — read every session and obey:
> - While `status: waiting_for_first_draft`, offer the Loop as soon as the core path works;
>   disclose that free checks can run after changes but paid golden evals need separate consent.
> - While `status: on`, run Rung 1 and every FREE eval below after each meaningful change;
>   report per-eval ✅/❌, fix, and repeat. Never predict a result from code alone.
> - GOLDEN SET: never runs automatically per-change. Obey `consent.paid_evals` in
>   `.power-coding/config.json`; before any paid run, log one hypothesis plus estimated
>   calls/cost, reproduce failures free, and make one paid confirmation per hypothesis.
> - When an eval passes three consecutive runs, offer to graduate it into an automated test.

## Goal
Blindspot connects to an already-built agent, discovers workflows and model nodes, retains only
user-authorized data, runs technically compatible models on an explicitly authorized golden-set
budget, and surfaces evidence-backed model recommendations that the user approves—never a silent
live-model switch. The hosted GSTPilot observation path is proven; v1 is done when the full
golden-to-replay-to-approval path is proven against a hosted external app and Phase 8 makes it durable.
“Discovers” currently means nodes that the app instruments and executes, not static source topology.

## Rung 1 — existing zero-token checks
Rung 1: `pnpm typecheck && pnpm test:auth-origin && pnpm test:eval-plan && pnpm build`
CI: none yet

## Free evals — only automatic while the Loop is on

| # | Input (action / call) | Expected |
|---|---|---|
| F1 | Validate `docs/mermaid/*.mmd`, then rebuild `docs/architecture-flow.html` | Every diagram parses; the viewer contains every `.mmd`. |
| F2 | Run the repository secret scan (staged before commits, full for baseline) | No secret-pattern hit; `.env*` values remain untracked. |
| F3 | Start gateway/dashboard and request `/healthz` + `/login` | Gateway returns JSON 200; dashboard returns HTML 200 without exposing a project key; legitimate same-origin key sign-in persists across tabs. |

## Golden set — paid/graded product evals (approval required)
These real-provider flows run only after the user sees the estimate and approves them.

| # | Input | Reference output / must-haves | Check |
|---|---|---|---|
| G1 | Complete `route:summarizer` call | Approved live model is called; completion and trace usage/cost/latency persist. | exact flow |
| G2 | Call a new route alias | Route auto-creates with default policy; call succeeds. | exact flow |
| G3 | Generate a golden set from task/context | 20+ diverse, self-contained inputs with references and rubrics. | rubric |
| G4 | Confirm a disclosed Sonnet-vs-Haiku plan | Only authorized cases run; complete same-plan evidence may create a pending Recommendation; live model stays unchanged. | exact flow |
| G5 | Approve then separately reject recommendations | Approve changes live model atomically; reject does not and stores reason. | exact flow |
| G6 | Simulate a sub-band version score | Drift event and evidence-backed pending recommendation; no silent revert. | exact flow |
| G7 | Inspect provider-key API/log behavior | Ciphertext at rest; no raw credential in API or logs. | contains/no-leak |

## Run journal (paid/slow checks only)
| Date | Hypothesis | Result | Cost note |
|---|---|---|---|
