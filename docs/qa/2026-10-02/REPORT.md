# Blindspot free workflow review — 2 October 2026

The review contains **112 distinct failure scenarios across 12 categories**, not 112 defects: 24 fixed, 51 verified, 34 source-checked, two residual and one unverified. Severity/occurrence/detection values are ordinal estimates, not measured incident rates. See [JSON](fmea.json), [CSV](fmea.csv) and [coverage](coverage.json).

The Oct1 service remains live. This correction has a coherent local production build and scanned gateway/web archives; root's final hydrated browser acceptance passed; exact-image deployment is pending. This workstream made **zero paid/provider requests** and no production mutations.

## Demonstrated changes

- Preserve provider completion status; reject incomplete candidates before judging. Keep known usage through later failures and count it once.
- Freeze the judge to the reviewed immutable plan. Unknown dispatched spend stops execution and remains null in example, run and plan totals, rather than a misleading zero or subtotal.
- Reject invalid/empty uploads, duplicate CSV headings, oversized context and non-exact or duplicate generated prompts. Preserve input whitespace and full input text.
- Fence asynchronous dataset/context reads by selection version. Pending reads and read errors block Review/Publish; edits invalidate old reads and consent.
- Preserve the explicit `expected`/`referenceOutput` aliases as canonical reference output, reject unknown/conflicting fields and show an exact JSONL example. Editing clears the previous upload error.
- Prevent metadata-only/unavailable trace markers from becoming golden prompts. The server rejects promotion before insertion; the client disables Promote and explains the missing input.

## Free evidence

- [50 input contracts](inputs.log) include CSV/JSON/JSONL alias preservation, unknown keys and reference conflicts.
- [23 provider/actual SDK contracts](providers.log) include completion, metering, malformed structured output and bounded decoded response handling.
- [Four session-authored prompt proxies](session-proxy.log) exercise the actual judge/golden prompts and structured boundary. These are authored fixtures, **not evidence of provider reasoning quality**.
- [Native actual-PG eval contracts](test-eval-plan-final.log) cover unknown candidate and unknown judge totals, immutable judge authorization and two metadata promotion attempts whose before/after example rows stay unchanged. [Native metrics](test-metrics.log) also passed.
- [19 isolated real-PG security/storage/usage checks](database-contracts.json) and [26 compiled Auth.js/Server Actions checks, 46 requests](auth-http-final.json) passed with no provider activity.
- [Secret-free production build](build-final.json), build ID `6CYJcwrMiW8KvXWTY85ug`, passed with external networking denied and no source drift; [log](build-final.log). Preview/tests were restarted onto that build. No live credentials were supplied to the build.
- [Independent review](independent-review.json) identified the aggregate-cost and pending-read gaps before they were corrected. Its file hashes predate the last two browser-discovered import fixes; the final build pins the later runtime.

## Limits and release boundary

[Root's final hydrated browser checks](browser-qa.json) passed expected-reference publication, full input editing/reload, metadata promotion disabled and desktop/mobile layouts without document overflow. A deliberately delayed file-read browser simulation is not claimed. No new live judge, golden generation, production replay, 10× load or resumable worker proof is claimed. Inline evaluation and the lifetime USD0.25 owner/USD2 shared limits remain unchanged; unknown dispatched reservations are retained. Two documented low AI SDK4 advisories remain mitigated on reachable paths, not removed from the dependency tree.

Oct1's paid SDK completion (16 input/5 output tokens, estimated USD0.0000054) proved completion/metering and telemetry, not evaluation quality. Prepared scores remain explicitly illustrative.

Root's release helper must use the scanned exact immutable images, preserve live environment/configuration except image, and confirm idle dispatch/evaluation work before either restart. Package-template mock environments must not replace live configuration. Source publication and deployment status belong to the final external release receipt, not an implied result of these free checks.
