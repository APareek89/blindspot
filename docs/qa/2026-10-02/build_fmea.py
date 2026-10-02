"""Explicit product scenarios, not generated bug claims. Rebuild CSV after QA."""
import csv,json
from pathlib import Path
root=Path(__file__).parent
rows=[]
def group(category,evidence,lines):
 for line in lines.strip().splitlines():
  status,scenario=line.split('|',1)
  s,o,d=(8,3,7) if status=='fixed' else (6,2,2) if status=='verified' else (6,2,5) if status=='source_checked' else (6,3,6)
  if 'unknown spend' in scenario:s,o,d=8,4,7
  rpn=s*o*d
  rows.append(dict(id=f'BS-{len(rows)+1:03}',category=category,scenario=scenario,status=status,evidence=evidence,severity=s,occurrence=o,detection=d,rpn=rpn,priority='P0' if rpn>=200 else 'P1' if rpn>=100 else 'P2'))
group('unhandled_error_paths','scripts/test-fmea-inputs.ts; apps/dashboard/lib/api.ts; apps/dashboard/components/PageError.tsx','''
verified|Malformed JSON dataset gives a useful validation error
verified|JSON object without an examples array cannot reach database insertion
verified|Malformed JSONL line reports a parsing error
verified|CSV field-count mismatch is rejected
fixed|Numeric or object dataset payload avoids raw Buffer TypeError
source_checked|Private gateway unavailable shows an actionable service error
source_checked|HTML proxy response does not crash JSON parsing silently
source_checked|Response exceeding eight MiB is cancelled
source_checked|Server Action exception is bounded and shown as an action error
''')
group('external_dependency_failures','scripts/test-providers.ts; scripts/test-session-prompt-proxy.ts; packages/providers/src/transport.ts','''
verified|429 response makes one dispatch without automatic retry
verified|Malformed structured output records known usage before failing
fixed|Valid JSON with length finish cannot become a successful judge
fixed|Content-filter termination cannot become successful structured output
fixed|Whitespace-only completion cannot appear as a finished answer
verified|Compressed success body is decoded by the actual Node transport
verified|Compressed error body remains an error
verified|Oversized decompressed provider body is cancelled
source_checked|Provider deadline bounds body reads as well as connection establishment
''')
group('race_conditions_and_state','apps/dashboard/app/(app)/golden-sets/[route]/GoldenManager.tsx; scripts/test-eval-plan.ts; client-session.test.ts','''
fixed|Slow dataset A cannot replace later selection B
fixed|Slow file read cannot overwrite manually edited dataset text
fixed|Old context documents cannot overwrite a newer document selection
fixed|Switching source invalidates pending file-read results
fixed|Publishing invalidates pending dataset and context reads
source_checked|Account change invalidates in-flight action completion
verified|Concurrent signup creates one project for an invite
verified|Eval plan row lock prevents duplicate confirmation execution
verified|Late child span does not reopen a completed execution
''')
group('resource_exhaustion','scripts/test-fmea-inputs.ts; packages/providers/src/metering.ts; packages/db/src/quota.ts','''
verified|Upload UTF-8 byte limit includes multibyte currency text
verified|Too many uploaded examples are rejected
verified|Generation count above20 is rejected
verified|Fractional draft count is rejected
verified|Chat maximum output above2048 is rejected
verified|Empty telemetry batch is rejected
verified|Multimodal message objects cannot trigger URL fetching through text adapter
source_checked|Per-owner storage reservations include concurrent pending writes
source_checked|Active provider concurrency is bounded per owner and globally
''')
group('security_access_control','scripts/test-portfolio-http.mts; scripts/test-portfolio-db.ts; packages/db/src/execution.ts; apps/gateway/src/auth.ts','''
source_checked|Anonymous requests cannot manage project resources
source_checked|Foreign project cannot read a workflow by guessed UUID
source_checked|Foreign project cannot mutate another golden example
source_checked|Foreign project cannot read another eval plan
source_checked|SDK credentials cannot access management routes
source_checked|Revoked SDK credential cannot invoke completion
source_checked|Copied browser cookie is rejected after signout revokes database session
verified|Unapproved provider host is rejected before credential transmission
verified|Prepared execution identity cannot call a paid provider
''')
group('data_integrity_partial_writes','packages/core/src/golden/service.ts; scripts/test-eval-plan.ts; scripts/test-fmea-inputs.ts','''
fixed|Empty dataset cannot create a misleading empty latest golden version
fixed|Duplicate CSV headings cannot silently overwrite the original input column
fixed|Whitespace-only golden input cannot be saved or patched
verified|UTF-8 BOM is handled in CSV JSON and JSONL imports
verified|Code indentation survives JSON dataset import
fixed|Evidence persistence failure cannot count returned usage twice
verified|Failed truncated example retains its partial text and no score
verified|Cross-route trace promotion is rejected even inside one project
source_checked|Golden version and all example rows are inserted atomically
''')
group('observability_gaps','scripts/test-providers.ts; scripts/test-eval-plan.ts; dashboard pages; provider ledger','''
fixed|Gateway no longer labels a token-limited reply as stop
verified|Incomplete candidates have persisted failed evidence rather than invented scores
verified|Known billed malformed judge output keeps its actual returned cost
verified|Unknown failed candidate cost remains null in example evidence
source_checked|Provider exceptions expose no request headers or raw prompt bodies
source_checked|Authoritative usage survives best-effort trace storage failure
source_checked|Prepared scores are labeled illustrative in dashboard
source_checked|Observed node count is not presented as full source topology
residual|No automated incident alerting for every application exception is shipped
''')
group('scale_and_load_failures','packages/db/src/client.ts; packages/db/src/quota.ts; packages/core/src/eval/queue.ts; README.md','''
source_checked|Database connection pool has a finite maximum
source_checked|Database lock wait has a timeout
source_checked|Database statement has a timeout
source_checked|Trace storage has a per-owner record ceiling
source_checked|Telemetry batches have an HTTP byte ceiling
source_checked|Gateway HTTP rate limit bounds one owner
source_checked|SDK request rate limit bounds one owner
unverified|Ten-times concurrent real user load has not been reproduced
residual|Inline evaluation has no durable worker resume after process termination
''')
group('billing_credit_mismatches','scripts/test-eval-plan.ts; scripts/test-provider-ledger.ts; packages/providers/src/metering.ts','''
fixed|Environment grader change cannot replace the judge authorized by the plan
fixed|A failed dispatch with unknown spend stops further paid work in the plan
verified|Known candidate cost remains recorded when judge parsing fails
verified|Truncated candidate incurs no additional judge request
verified|Budget below minimum disclosed case is rejected
verified|Negative zero nonnumeric and excessive budgets are rejected
source_checked|Lifetime shared allowance includes uncertain reservations
source_checked|Provider costs require verified supported-model pricing
source_checked|Prepared examples do not reserve or consume live budget
''')
group('retry_idempotency_issues','scripts/test-eval-plan.ts; scripts/test-providers.ts; packages/core/src/examples.ts; packages/db/src/usage.ts','''
verified|Completed eval plan cannot be run a second time
verified|Failed eval plan cannot be run again through repeated confirmation
verified|Transport is single-dispatch even if SDK attempts a retry
verified|Ambiguous dispatch does not trigger an automatic retry
source_checked|Repeated prepared-example creation returns the existing workflow
source_checked|Unused stale reservation can be released only before dispatch
source_checked|Dispatched stale reservation becomes uncertain rather than released
source_checked|Recommendation failure preserves completed paid evidence
source_checked|Golden uploads create explicit new versions rather than overwriting history
''')
group('config_feature_flag_drift','scripts/test-fmea-inputs.ts; packages/providers/src/transport.ts; packages/db/src/client.ts; API auth','''
verified|Truthy string is rejected for live-trace consent
verified|String confirmation cannot start a paid plan
verified|Streaming true is rejected instead of silently misreported
verified|Mock mode returns explicitly synthetic zero-token output
source_checked|Production cannot start with authentication disabled
source_checked|Non-loopback database cannot disable TLS
source_checked|URL SSL query flags cannot override explicit database CA validation
source_checked|Missing gateway origin is diagnosed
source_checked|Unimplemented provider names cannot dispatch through a guessed URL
''')
group('edge_cases_from_prd','scripts/test-session-prompt-proxy.ts; scripts/test-eval-plan.ts; GoldenManager.tsx; browser screenshots','''
fixed|Generated golden count must match the requested count exactly
fixed|Duplicate generated prompts cannot masquerade as diverse examples
fixed|Golden input containing question colon is no longer silently cropped
fixed|Oversized context document is rejected instead of silently truncated
verified|Session-authored adversarial candidate is judged under the real prompt and SDK schema
verified|Model-only screening cannot justify a production recommendation
verified|Observe-only approval waits for external rollout rather than claiming a switch
verified|Stale recommendation cannot overwrite a newer live model
unverified|Responsive evidence-table and document-upload screenshots pending current-build browser acceptance
''')
group('billing_credit_mismatches','scripts/test-eval-plan.ts:629-660; packages/core/src/eval/runner.ts; packages/core/src/eval/planner.ts; docs/qa/2026-10-02/independent-review.json','''
fixed|Unknown candidate or judge spend cannot become a numeric zero or known subtotal in run and plan aggregates
''')
group('race_conditions_and_state','apps/dashboard/app/(app)/golden-sets/[route]/GoldenManager.tsx; docs/qa/2026-10-02/independent-review.json','''
fixed|Pending dataset or context reads block Review and Publish until the current read finishes without an error
''')
group('unhandled_error_paths','packages/core/src/golden/upload.ts; scripts/test-fmea-inputs.ts; docs/qa/2026-10-02/inputs.log','''
fixed|Expected reference aliases persist and unknown or conflicting upload fields cannot silently discard target output
''')
group('data_integrity_partial_writes','packages/core/src/golden/service.ts; scripts/test-eval-plan.ts; docs/qa/2026-10-02/test-eval-plan-final.log','''
fixed|Metadata-only trace markers cannot become a golden prompt through promotion
''')
# Completed fresh compiled HTTP checks; do not promote unrelated source inspection.
verified_http={
 'Foreign project cannot read a workflow by guessed UUID',
 'Foreign project cannot mutate another golden example',
 'Foreign project cannot read another eval plan',
 'SDK credentials cannot access management routes',
 'Revoked SDK credential cannot invoke completion',
 'Copied browser cookie is rejected after signout revokes database session',
}
for row in rows:
 if row['scenario']=='Responsive evidence-table and document-upload screenshots pending current-build browser acceptance':
  row['scenario']='Golden imports and retained input are usable on desktop and mobile without document overflow'
  row['status']='verified';row['evidence']='docs/qa/2026-10-02/browser-qa.json'
  row.update(severity=5,occurrence=2,detection=2,rpn=20,priority='P2')
 if row['scenario'] in verified_http:
  row['status']='verified';row['evidence']+='; docs/qa/2026-10-02/auth-http.json'
  row.update(severity=6,occurrence=2,detection=2,rpn=24,priority='P2')
assert len({row['category'] for row in rows})==12
assert len(rows)==112 and len({row['scenario'] for row in rows})==112
(root/'fmea.json').write_text(json.dumps({'scenarios':rows,'scope':'112 failure scenarios, not 112 defects; UI read races are source-reviewed; root browser verified publication, full input reload, alias retention, metadata controls and responsive layout','scoring':'Ordinal S/O/D 1-10; risk estimates are not measured incidence. Original fixed-item scores describe the pre-control risk; verified checks use lower detection scores.'},indent=2)+'\n')
with (root/'fmea.csv').open('w',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');writer.writeheader();writer.writerows(rows)
(root/'coverage.json').write_text(json.dumps({'scenarios':len(rows),'categories':12,'statuses':{s:sum(r['status']==s for r in rows) for s in sorted({r['status'] for r in rows})},'paid_calls_this_task':0,'scope':'Code, API, actual SDK proxies, isolated database and UI; source checks are not runtime passes'},indent=2)+'\n')
print((root/'coverage.json').read_text())
