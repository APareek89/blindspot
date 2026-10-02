# Blindspot — current handoff
last-synced: `f0e6c235cabf6e7e1f0eef08dbd3851e71801b3f`; free review 2026-10-02
Continue in `/Users/macbook/Documents/Codex/portfolio/blindspot`.

## Current state
The Oct1 AWS launch is live; this Oct2 runtime correction is locally built/tested but not yet released.
Root owns final browser acceptance, source publication and image-only deployment; this review made zero provider calls or cloud mutations.
Normal human access is Auth.js email/password with durable owner sessions; SDK credentials remain separate and revocable.
Hosted PostgreSQL uses the per-app DML role and verified CA; public same-origin /v1 routes expose only the SDK allowlist.
The private gateway holds provider/encryption secrets; the dashboard has only DB/Auth/bridge secrets.
Evaluations run inline in two containers, with no idle worker or Redis; SDK assets and licensed fonts are packaged locally.

## Current corrections
Provider completion status remains truthful; truncated/empty candidates cannot be judged as complete.
Known usage survives structured parse or persistence failure and is counted once.
Unknown dispatched usage stops the plan; example, run and plan costs remain unknown, not zero/subtotal.
The evaluated judge is the exact model in the reviewed immutable plan, regardless of later configuration.
Golden imports reject wrong types, empty/whitespace cases and duplicate CSV headings; BOM and code indentation are preserved.
Generated counts are exact and duplicate prompts fail; this is schema/proxy evidence, not a diversity/quality guarantee.
Expected upload aliases persist; unknown/conflicting fields reject and metadata-only traces cannot be promoted.
Golden input text is displayed without cropping at “question:”; oversized context is rejected explicitly.
File generations invalidate stale reads; pending dataset/context reads and errors block Review/Publish, and edits invalidate consent.
Prepared examples remain immutable, labelled illustrative and provider-free; model-only screening cannot authorize a production swap.

## Evidence and limits
`docs/qa/2026-10-02/REPORT.md` links all evidence;112 scenarios/12 categories are not112 discovered bugs.
50 input tests,23 actual SDK/transport contracts, four actual-prompt session-authored proxies, native eval/metrics and typecheck/build passed.
Independent fresh actual-PG19 checks and compiled Auth.js/Server Actions26 checks/46 requests passed on the compiled release (final build `6CYJcwrMiW8KvXWTY85ug`).
Two independent review findings (unknown aggregate cost, pending read publication) were corrected; no remaining scoped review blocker.
Root browser verified reference alias publication, full input edit/reload, disabled metadata promotion and desktop/mobile layout; no provider or usage change.
Lifetime included provider caps remain USD0.25 per owner/USD2 shared; unknown reservations are retained, no daily reset implied.
Current free checks do not validate real judge quality, production replay correctness, load at10× or restart-resumable evaluation workers.
Oct1 paid evidence was one gpt-4o-mini SDK completion (16 input/5 output, estimatedUSD0.0000054), not judge/golden quality evidence.
Two low AI SDK4 advisories remain documented with reachable-path mitigations; do not claim an audit-free dependency tree.

## Next steps
Root reviews the unexecuted exact-image helper, packages/scans frozen source and deploys gateway then web.
No new paid Blindspot request is authorized by this workstream; retain old receipts and existing live configuration/credentials/mounts.
Loop remains off; standing paid consent and unrelated FMEA triggers are unchanged. No commits by the review worker.
