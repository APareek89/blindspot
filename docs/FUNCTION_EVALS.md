# Function evals — proposed Blindspot extension (not implemented)

The SDK and ingest schema can represent deterministic `function`, `tool` and `retrieval` spans, but
Blindspot only knows about nodes the connected application explicitly instruments and executes.
GSTPilot currently emits its root agent span and model generations; its remaining deterministic
steps are not yet present in Blindspot. These nodes must never be presented as model Routes: they
need a separate **Function Eval Registry** and runner.

This document is the approved direction, not a shipped capability. Model evals answer “which model
works best at this generation node?” Function evals answer “does this deterministic unit still obey
its contract?”

## Contract

Each registered function version declares:

- an input/output schema;
- fixtures or promoted production cases;
- exact, schema, invariant/property and metamorphic assertions;
- allowed side effects plus mocks/snapshots for databases and external services;
- latency, memory, exception, retry and idempotency limits;
- source commit, dependency version and environment.

The user can seed cases by importing existing unit tests/fixtures, promoting a consented trace, or
asking an agent to propose edge cases from the function schema and design documents. The user still
reviews and versions the suite.

## Run and evidence

Run the real function in an isolated worker with network/clock/randomness controls. The evidence
table mirrors model evals but replaces judge quality with deterministic assertions:

`label · input · expected/invariant · actual output · assertions · pass/fail · latency · side effects`

Optional LLM judging is appropriate only for outputs that are genuinely semantic; deterministic
checks remain the source of truth wherever possible.

## Drift and recommendations

Compare function results across commits, dependency versions and live operational baselines.
Regressions create approval-gated **code/test Recommendations** such as “add this failing edge case,”
“roll back dependency X,” or “candidate implementation B preserves output and cuts p95 latency.”
They never create a model-switch Recommendation.

At the workflow level, an agent eval can then compose:

1. generation-route quality;
2. tool/retrieval/function correctness;
3. trajectory assertions (which nodes ran, in what order, with what side effects); and
4. end-to-end answer quality.

This makes Blindspot a workflow reliability layer, not only an LLM leaderboard.

## Smallest implementation sequence

1. Add an application-owned declared function contract (name, version, schemas and safe runner).
2. Import or create reviewed fixtures without executing customer code in the gateway process.
3. Run fixtures in an isolated worker with network/side-effect controls and persist assertion rows.
4. Show function evidence separately from model Routes and create approval-gated code/test actions.
5. Compose function, trajectory and model evidence only after each evidence type remains legible.
