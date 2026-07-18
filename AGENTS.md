# Blindspot — agent guide

**Eval-gated model & cost layer for AI agents.** Blindspot runs every step of an agent on
the cheapest model that still passes a quality bar, and catches the day a provider's new
model version silently regresses — surfacing an **evidence-backed recommendation the user
approves, never a silent switch**. Full plan: [`Blindspot-PRD.md`](./Blindspot-PRD.md).
Current state: [`Handoff.MD`](./Handoff.MD).

## Build discipline (PRD §0)
- Architecture aligned & **approved 2026-07-16** — do not re-litigate the stack below.
- Work **§12 one prompt at a time**; **teach plain-English-then-technical**, show the diff
  + a one-line "how to verify", and **pause for the user's OK** between steps (§0b).
- **Never print secret values** — only check presence. `.env.example` ships blank; `.env`
  is git-ignored and owned by the *parallel secrets session*. Read from `.env`, never
  hard-code.
- Build only inside this folder. Standardize naming to **Blindspot / `bs_`** (no residual
  `evaldrift` / `ed_`).

## Two non-negotiables (baked in)
- **Approval-gated swaps (§3):** never change a live model silently. Every better/cheaper
  candidate *or* drift becomes a Recommendation carrying eval evidence in the Approvals
  inbox; the user approves/rejects. Per-route auto-approve is opt-in, default **OFF**,
  every auto-action still logged with evidence.
- **Golden-set lifecycle (§7):** seed by **upload OR agent-generate** → **grow** from
  production (human-curated) → full CRUD + versioning + promote-a-trace. Never a one-time
  upload.

## Stack (approved)
TypeScript · **pnpm + Turborepo** monorepo · OpenAI-compatible **gateway** · **Vercel AI
SDK** (pluggable provider adapters) · **Drizzle ORM** on Postgres · **BullMQ on Redis**
(eval workers; worker runs in-process for local dev until Phase 8) · **Zod** as single
source of truth · **Next.js** dashboard · user provider keys encrypted at rest with
**AES-256-GCM** (`ENCRYPTION_KEY`) · Render deploy · `/healthz` · OpenTelemetry + Sentry ·
k6 load test. **v1 providers:** Gemini (+ judge), Groq, HuggingFace, Anthropic (OpenAI
optional). `JUDGE_MODEL` configurable (Gemini flash / Claude Haiku).

## Layout (target)
- `apps/gateway` — OpenAI-compatible proxy; resolve `route:<name>` → approved model; trace
- `apps/worker` — eval runs (golden set → judge → score → drift check → recommendation)
- `apps/dashboard` — Next.js UI (§10 screens: Overview · Routes · Approvals · Drift ·
  Golden Sets · Connect · Settings)
- `packages/db` — Drizzle schema/queries (§9) · `packages/shared` — Zod schemas/types
- `docs/mermaid` + `docs/ARCHITECTURE_FLOW.md` — architecture diagrams

## Power Coding (auto — do not remove without asking the user)
At session start read Handoff.MD; FIRST run `git log --oneline <its last-synced sha>..HEAD`
and reconcile anything changed underneath it; then open with its pending points. Update
Handoff.MD before every git checkpoint commit and at the end of every phase (low context is
a secondary trigger) — snapshot, not journal, re-stamp `last-synced` with HEAD. If context
was the trigger, give the continuation phrase using the absolute `Blindspot_v1` path. Above
~40 lines or ~15 ✅ items, collapse shipped detail into one line.
Log flow changes / user-reported bugs in Learning.MD using its 5-whys format.
Read Loop.MD every session and obey its `status:` machine. While `status: on`, run the FREE
evals after every meaningful change and report pass/fail. Paid/golden evals run only per
`consent.paid_evals` (default ask; offer at milestones, never auto per-change).
Keep docs/mermaid/*.mmd current when the flow changes (see docs/ARCHITECTURE_FLOW.md).
Obey `.power-coding/config.json` FMEA triggers. A pre-commit trigger runs the staged secret
scan first and blocks on a hit, then light FMEA; feature-complete runs the consent-governed
full scan; manual requests always scan. Pin scans to a sha, use every configured failure
category, and re-stamp `.power-coding/state.json`. P0 blocks and asks.
If Sentinel is enabled, run its four-lens scan after major tasks; if Session Pulse is enabled,
report feature/support/rework effort and save it in Handoff.MD.
Checkpoint every working state and before risky changes per `consent.git_checkpoints`.
Before features, state and build the smallest proof first. New service/dependency/data-model/
async architecture requires a plain-language diagram delta and user approval before code.
Log stack/architecture/behavior decisions in Handoff.MD; never silently reverse one. Keep
Blindspot-PRD.md current. Full FMEA scans obey `consent.fmea_full_scan`.
