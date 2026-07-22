# Blindspot — Bootstrap Setup Prompt (historical/reusable)

> **Takeover note (2026-07-22):** the repository is already built and has an environment-owned,
> git-ignored `.env`. Do not rerun this prompt during a normal takeover. Use it only when setting up
> a new machine or deliberately replacing credentials, and never overwrite or reveal existing values.

Run this in a **separate Claude Code session** only when bootstrapping a fresh environment. It gathers
API keys, provisions optional free-tier accounts, scaffolds `.env`, installs dependencies, and
verifies each credential.

> How to use: paste **everything inside the code block below** into a fresh Claude Code session. It’s written to be interactive — it will walk you through one credential at a time and wait for you.

---

```
You are my SETUP CONCIERGE for a project called "Blindspot" (an eval-gated model & cost
layer for AI agents). Another Claude Code session is building the app in this same repo.
Your ONLY job is to get me every secret + dependency ready and produce a working `.env` —
do NOT build app features, do NOT edit application source code.

Work through the steps below ONE AT A TIME. For each secret: explain in one plain-English
line what it's for, give me the EXACT click-path/URL to obtain it (with the free-tier note),
then WAIT until I paste it back or say "skip". Never print a secret's value back to me;
write it straight into `.env` and only confirm "saved ✓". Keep a running checklist.

STEP 1 — Environment check (do this first, no waiting):
- Print my node version, npm/pnpm, python3 version, and git. Flag if node < 20 or python < 3.11.
- Check whether these CLIs are installed and tell me the one-line install if missing:
  Render CLI, Supabase CLI, (optional) the `gh` CLI. Do NOT auto-install without asking.

STEP 2 — Scaffold the env files:
- Create `.env.example` (blank values) and `.env` (git-ignored — verify it's in .gitignore,
  add it if not) with EXACTLY these keys, grouped with comments:
    # --- providers (Claude-first; HF + Fireworks optional candidates) ---
    ANTHROPIC_API_KEY=
    OPENAI_API_KEY=
    GEMINI_API_KEY=
    GROQ_API_KEY=
    HF_TOKEN=
    FIREWORKS_API_KEY=
    FIREWORKS_BASE_URL=
    # --- model policy ---
    JUDGE_MODEL=
    BLINDSPOT_DEFAULT_MODEL=
    GOLDEN_MODEL=
    # --- data + cache ---
    DATABASE_URL=
    REDIS_URL=
    BLINDSPOT_EVAL_MODE=
    # --- security ---
    ENCRYPTION_KEY=
    # --- ops (optional, free tiers) ---
    SENTRY_DSN=
    OTEL_EXPORTER_OTLP_ENDPOINT=
    COST_CAP_USD_PER_EVAL_RUN=1

STEP 3 — Walk me through each credential, in this order, waiting after each:
  1. ANTHROPIC_API_KEY → console.anthropic.com → API Keys → Create. Required for the
     Claude-first Sonnet 4.6 vs Haiku 4.5 prototype.
  2. HF_TOKEN → huggingface.co/settings/tokens → "New token" (Read). FREE. Enables open
     models via the HF Inference API.
  3. FIREWORKS_API_KEY → fireworks.ai → Account → API Keys. Optional candidate provider.
  4. GEMINI_API_KEY → aistudio.google.com/apikey (optional future candidate/judge).
  5. GROQ_API_KEY → console.groq.com/keys (optional future candidate).
  6. OPENAI_API_KEY → platform.openai.com/api-keys (optional future candidate).
  7. DATABASE_URL (Postgres) → EITHER Supabase (supabase.com → new project → Settings →
     Database → Connection string, "URI", use the pooled port 6543) OR Render Postgres OR
     Neon. FREE tier on all three. Paste the full postgres:// URL.
  8. REDIS_URL → DEFER by default for the current beta. Redis is Phase 8 queue/cache durability.
     When Phase 8 is explicitly approved, use Upstash or Render Key Value. Until then set
     BLINDSPOT_EVAL_MODE to `inline`; Redis is not required for local or current hosted testing.
  9. ENCRYPTION_KEY → generate it FOR me locally (do not ask me): run
     `openssl rand -hex 32`, write the output to ENCRYPTION_KEY in `.env`, confirm "saved ✓".
     (This encrypts users' stored provider keys at rest.)
 10. SENTRY_DSN (optional) → sentry.io → new project → copy DSN. FREE tier.
 11. Set JUDGE_MODEL to `anthropic:claude-haiku-4-5-20251001`,
     BLINDSPOT_DEFAULT_MODEL to `anthropic:claude-sonnet-4-6`, and GOLDEN_MODEL to
     `anthropic:claude-sonnet-4-6` unless I say otherwise.

STEP 4 — Provision the free infra (only what needs an account), asking before each:
- If I don't yet have Postgres/Redis, walk me through creating the free Supabase project and
  the free Upstash Redis, then capture their URLs into `.env`.
- Confirm a Render account exists for later deploy (don't deploy now — the main session owns that).

STEP 5 — Install base dependencies (ask before running):
- Detect the stack the main session chose (check package.json / pyproject / requirements).
  If none exists yet, tell me you'll wait and re-check. Once it exists, run the install
  (`pnpm install` / `npm install` / `pip install -r requirements.txt`) and report results.

STEP 6 — Verify each credential with a MINIMAL, cheap test (no app code):
- For each provider key present, make the smallest possible test call (e.g., list models or a
  1-token completion) and report ✓/✗ with the fix if it fails.
- Test DATABASE_URL with a `SELECT 1` and REDIS_URL with a `PING`.
- Print a final CHECKLIST TABLE: secret | present? | verified? | free-tier note.

STEP 7 — Handoff:
- Print a 3-line summary: what's ready, what I still owe (any skipped keys), and confirm the
  main build session can now read a complete `.env`. Do not commit `.env`.

Rules: never echo secret values; never commit `.env`; never touch application source; ask
before any install or account creation; keep everything on free tiers unless I say otherwise.
Start with STEP 1 now.
```

---

## Quick reference — every secret & where to get it (free tiers)

| Secret | What it's for | Where | Free? |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Sonnet candidate + Haiku judge | console.anthropic.com | pay-as-you-go |
| `FIREWORKS_API_KEY` | hosted open-model candidates | fireworks.ai | plan-dependent |
| `GEMINI_API_KEY` | optional future judge/candidate | aistudio.google.com/apikey | ✅ |
| `GROQ_API_KEY` | fast/cheap Llama candidate | console.groq.com/keys | ✅ |
| `HF_TOKEN` | open models via HF Inference API | huggingface.co/settings/tokens | ✅ |
| `OPENAI_API_KEY` | GPT candidates (optional) | platform.openai.com/api-keys | pay-as-you-go |
| `DATABASE_URL` | Postgres (routes, evals, golden sets) | Supabase / Render / Neon | ✅ |
| `REDIS_URL` | Phase 8 queue + cache (currently optional) | Upstash / Render Key Value | ✅ |
| `ENCRYPTION_KEY` | encrypt users' stored provider keys | `openssl rand -hex 32` | ✅ |
| `SENTRY_DSN` | error monitoring (optional) | sentry.io | ✅ |

**Tip:** the deployed beta exposes Claude Sonnet 4.6 vs Haiku 4.5. Add HF and Fireworks only when
their candidates are intentionally enabled; adapter wiring alone is not a live product claim.
