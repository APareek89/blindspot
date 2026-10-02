# Learning.MD — Blindspot
> AGENT: add an entry whenever the basic flow changes, the user reports a bug or gives
> corrective feedback, or something took real time to figure out. CHECK THIS FILE FIRST
> before debugging — the answer may already be here. Plain language; first use of any
> technical term gets a one-line bracket explanation.

<!-- Newest first. Entry format: -->

## 2026-10-02 — Data import must preserve meaning, not just parse successfully
**Symptom.** Root's ordinary JSONL upload used `expected`; publication succeeded but the reference was missing. Metadata-only trace cards also offered Promote and the server could stringify their unavailable marker into a golden prompt.
**Five whys.** (1) The saved example was misleading. (2) Upload projection discarded unknown keys; trace conversion accepted arbitrary metadata. (3) The UI used a friendly label without an exact schema example and treated every trace as content. (4) Parsing success was mistaken for usable evaluation evidence. (5) **Deepest why: input semantic contract** — acceptance tests did not compare the user's intended reference and retained capture content to the stored example.
**Fix and prevention.** Document `reference_output` with explicit `referenceOutput`/`expected` aliases, reject unknown or conflicting fields, show a JSONL example, and clear stale errors when editing. Reject metadata-only promotion before insertion and disable its UI action with a reason. Fifty input contracts and the actual-PG native eval suite pass; two metadata promotion attempts leave examples byte-for-byte unchanged. Existing captures and examples are not rewritten. Root browser verified publication, full input edit/reload and disabled metadata promotion on desktop/mobile; deployment remains pending.

## 2026-10-02 — Completion and total cost must remain truthful through failures
**Symptom.** A gateway reply could always advertise stop; a truncated candidate could reach the judge, and known usage could be lost or counted twice after parsing/persistence failure. The judge could also drift from the reviewed plan through environment configuration. Independent review found that marking an example cost unknown was insufficient when its run/plan still stored zero or a known subtotal.
**Five whys.** (1) The displayed result implied completion or a complete cost. (2) Success wrappers substituted defaults and failure branches lost metadata. (3) Different layers separately accumulated cost and selected the judge. (4) Authorization, provider completion and persisted accounting were not treated as one contract. (5) **Deepest why: cross-layer acceptance coverage** — tests stopped at parsed output or one row, rather than checking immutable authorization and every aggregate after failure.
**Fix and prevention.** Preserve finish reason, reject incomplete candidates before judging, carry known usage through safe typed errors, count it once, and use the plan's judge. Unknown dispatched cost retains the reservation, stops further work and stays null in example/run/plan aggregates. Native PostgreSQL eval cases now cover unknown candidate and unknown judge after a known candidate. Actual SDK fixtures and session-authored prompt outputs are free protocol tests, not paid quality evidence.

## 2026-10-02 — A file selection is not complete until its current read finishes
**Symptom.** A slow older file could replace a newer selection or manual edit. A subtler review finding showed that Review/Publish could remain enabled while a new context file was reading, submitting old content even though the filename selection had changed.
**Five whys.** (1) The form could publish stale text. (2) Read completion had no selection version and pending reads did not block actions. (3) The old valid content remained usable during replacement. (4) File input, context consent and publishing used separate readiness assumptions. (5) **Deepest why: async state contract** — the UI checked populated fields but not whether they belonged to the current completed selection.
**Fix and prevention.** Version both dataset/context reads; selection/source changes, publishing and manual edits invalidate old results. Pending reads and read errors block Review/Publish; changed context resets consent. Reject oversize files instead of silently truncating. This change is source-reviewed and production-built; root browser verified normal upload/publication and input edit/reload; delayed-read races remain source-reviewed rather than browser-simulated. Normal compiled Auth.js/Server Actions26 checks/46 requests and actual-PG19 checks passed separately with zero provider calls.


## 2026-10-01 — Completion, telemetry and quality need separate evidence
**Verified:** a normal paid SDK completion returned16 input/5 output tokens, then the shipped SDK persisted a matching owner/project metadata span. One usage row settled at estimatedUSD0.0000054. The UI rounded the corresponding0.00054 cents to0.001 cents. There were no retries, judges or evaluation calls.
**Rule:** retain the full stored unit and distinguish a transport/metering proof from model quality. Prepared90% evaluation scores are fixed illustrative fixtures, even though their SDK ingestion and persistence are real. A live completion does not validate an approval or production model swap.


## 2026-10-01 — Mixed database access needs actual integration tests
**What happened:** isolated helpers passed, but compiled Server Actions failed after ordinary database access. Drizzle [the SQL mapping library] changes serializers on its shared postgres-js connection. A later raw SQL call passed a JavaScript Date for a bridge nonce and an object for usage pricing, which no longer encoded as expected.
**Action:** the raw nonce expiry uses an ISO timestamp string, and pricing uses an explicit JSON string cast to jsonb. Regression setup initializes the ORM first, then exercises the real bridge and usage path against PostgreSQL.
**Preventive action:** test the order of database APIs used by a real request. A helper tested before shared connection initialization does not prove its behavior afterward.

## 2026-10-01 — Account success and browser navigation are separate gates
**What happened:** overlapping anonymous session reads could replace the signup CSRF cookie before submission. After the protocol fix, a successful Credentials callback could still land on a cached anonymous login redirect in Next's client router.
**Action:** anonymous CSRF uses a stable signed anonymous subject; authenticated CSRF remains session-bound. Verified login and successful fenced signout now replace the full document, clearing the previous account's router cache. Cross-tab changes invalidate pending work immediately. Root verified the hydrated signup/signin/signout journey, not only HTTP response codes.
**Preventive action:** include concurrent initial session reads and full browser account transitions in acceptance. Keep localhost versus127.0.0.1 origin configuration consistent; do not weaken exact-origin checks to cover a preview mismatch.

## 2026-10-01 — Prepared evidence needs permanent provenance and honest controls
**What changed:** Try example now sends a real span through the shipped SDK, then persists two model-only evaluations with fixed responses and illustrative90% judgments. It makes no provider request. Ordinary workflows retain their existing budget, replay and approval behavior.
**Why:** fixed display names could collide with ordinary work, UUID spelling could bypass a boundary check, and ordinary feedback could alter prepared Monitor metrics. The implementation now reserves an owner-scoped UUID namespace, checks canonical UUID syntax case-insensitively, and rejects prepared mutations including feedback. Tests preserve pre-existing ordinary names and deny another owner.
**UI rule:** hide namespace UUIDs only in labels carrying the server's prepared marker. Keep values and URLs intact. Disable prepared mutation controls and show a read-only explanation while keeping evidence navigation usable. A fixture score is not live model quality, and an observed node is not the application's complete source topology.

## 2026-07-22 — Observed node inventory was mistaken for the application's full topology
**What happened:** hosted GSTPilot showed 3 production nodes while development showed 7, so the user
reasonably asked whether the hosted app was connected and why Blindspot had lost nodes.
**Why chain:** the UI said “nodes” without a coverage qualifier → `workflow_nodes` contains distinct
names upserted from received spans → production had only two requests and executed fewer branches →
GSTPilot instruments the root agent plus shared LLM helper, not every deterministic step → no declared
startup manifest exists. Deepest cause: `semantic contract` — runtime discovery was presented like
static architecture discovery.
**Action:** documented the counts and exact environments, standardized takeover guidance on “observed
nodes,” and made the missing declared-topology/coverage layer explicit. Production connection evidence
remains valid; the difference is coverage, not disconnection.
**Preventive action:** never call an ingested-node union the complete workflow. Future UI and schema
must separate declared, observed-in-development, observed-in-production and never-observed nodes;
connectors must explicitly instrument deterministic/retrieval/tool steps when that visibility matters.

## 2026-07-22 — The opaque-Origin fix covered logout but missed the sign-in form
**What happened:** after pasting a valid project key, the user received the raw JSON error
`cross-origin sign-in is not allowed`; the key was never validated and no session cookie was set.
**Why chain:** sign-in required an exact `Origin` → Chromium legitimately submitted the HTML form with
`Origin: null` → the browser still supplied same-origin Fetch Metadata, but sign-in did not use the
navigation-aware policy already added for logout → the zero-token check tested the helper without
testing the sign-in handler that needed it. Deepest cause: `acceptance-test boundary` — QA proved a
shared primitive and a logout journey, then incorrectly generalized that proof to every session form.
**Action:** sign-in now accepts either an exact origin or an opaque origin accompanied by browser-
controlled `Sec-Fetch-Site: same-origin` and `Sec-Fetch-Mode: navigate`; cross-site and missing-origin
posts still return 403. A route-level regression exercises the actual handler, and real Playwright
submitted `Origin: null` and received the expected 303 key-validation redirect instead of 403.
**Preventive action:** every authentication form needs an actual-handler matrix for exact-origin,
opaque same-origin, cross-site and missing-origin requests, plus one hydrated-browser submission.
Never infer route wiring from a helper test.

## 2026-07-22 — Browser QA failures can echo authenticated request headers
**What happened:** a hosted Playwright check used its API request client while the browser held
GSTPilot's real project cookie. A local certificate-chain failure printed the failed request headers,
including the cookie value, into the tool output.
**Why chain:** production auth state entered a general QA harness → the request client failed before
the assertion → its diagnostic helpfully included headers. Deepest cause: `test credential scope` — a
real long-lived application key was used where a disposable browser credential was required.
**Action:** stopped the session, deleted the permission-locked storage file, treated the key as
compromised, minted and verified a replacement, saved it only to GSTPilot's local `.env` and clipboard,
and reran hosted acceptance with page navigation only. The actual nine-tab + logout browser flow passed.
The old key stays active only until GSTPilot's Render variable is replaced; the stored Render API key
now returns 400, so automatic rotation is blocked on a fresh Render credential or one manual env edit.
**Preventive action:** never combine production cookies with Playwright request/network/trace output.
Use disposable projects for browser QA, log only status assertions, and rotate any credential that a
diagnostic prints—even when the task is private.

## 2026-07-22 — Same-origin form logout can legitimately carry an opaque Origin
**What happened:** the final Playwright signup journey reached every dashboard tab, but explicit
Sign out returned 403 and left the httpOnly session cookie usable.
**Why chain:** logout required an exact `Origin` match → Chromium submitted the same-origin form with
`Origin: null` → the strict JSON-request rule rejected a real navigation. Deepest cause: `browser
boundary` — login/signup fetches and user-activated form navigations do not always carry identical
origin metadata.
**Action:** JSON signup/fetch endpoints remain strict. HTML sign-in and sign-out forms accept an opaque
origin only when browser-controlled `Sec-Fetch-Site: same-origin` and `Sec-Fetch-Mode: navigate` prove
the navigation context. A cross-site opaque request is still rejected. Playwright now proves all nine
tabs, refresh persistence, harmless GET logout, forged cross-site rejection, POST cookie deletion and
post-logout protected-route redirect; the zero-token suite covers the origin policy directly.
**Preventive action:** authentication acceptance must use a hydrated browser and assert cookie presence
before and after logout. Do not infer browser request headers from server-side HTTP probes.

## 2026-07-21 — Smooth signup still needs a bounded credential and a retry-safe shown-once boundary
**What changed:** beta onboarding moved from an operator-created project/key to a link the tester can
open, confirm and continue directly into SDK connection.
**Why chain:** an unprotected `/signup` would permit project/key spam → a query-string token would enter
request/referrer logs → random shown-once keys make a lost HTTP response unrecoverable → unlimited
recovery from the invite would make “shown once” untrue. Deepest requirement: the invite and key
delivery are both credential boundaries, not ordinary form UX.
**Action:** the operator now signs an expiring email/project-bound token with the existing encryption
secret; it travels in the URL fragment, verifies at a size-limited public gate, concurrency-serializes
one project, atomically creates separate hash-only recovery/application keys, and permits the identical
response for only a five-minute loss-retry window. Signup starts metadata + observe-only, signs the
browser in and hands off to exact SDK steps. A cold database made the first create exceed 20 seconds,
so only creation gets a 45-second proxy timeout; preview remains 20 seconds.
**Preventive action:** test signup as invite → preview → create → cookie → both-key auth → retry →
Connect, plus tamper, expiry, concurrency and post-window denial. Never claim “shown once” while an
unbounded recovery credential can reproduce plaintext.

## 2026-07-21 — Never put a state-changing logout behind a prefetched navigation link
**What happened:** direct HTTP tests proved the login cookie worked across every protected route, but
the real browser still asked for the key after navigation.
**Root cause:** the sidebar rendered “Sign out” as a Next.js `Link` to `GET /logout`. Next may prefetch
visible links in the background, so loading the authenticated sidebar could call logout and expire the
cookie without the user clicking anything. HTTP cookie-jar tests do not execute browser prefetching and
therefore missed the failure. This was the deepest cause of the repeated-login loop; the earlier
Server Action diagnosis was incomplete.
**Fix:** logout is now POST-only, triggered by a normal form button, same-origin checked, and impossible
for link prefetch to execute. `GET /logout` has no state-changing handler.
**Hosted follow-up:** Render exposes the public host through forwarded headers, so comparing the form
origin to the internal request URL rejected a real Sign out with 403. Login and logout now share one
proxy-aware origin helper; proxy-shaped regression input must cover every same-origin form handler.
**Watch for later:** every GET and every prefetched route must be read-only. Browser-session acceptance
must execute the hydrated UI, not only request pages with a cookie jar.

## 2026-07-21 — Dashboard authentication must survive navigation and return to the requested tab
**What happened:** sign-in accepted the project key, but opening another dashboard tab asked for the key
again; submitting it then sent the user to Overview instead of the tab they had chosen.
**Root cause:** the only session writer was a Server Action [a form handler managed internally by
Next.js], and there was no end-to-end check that its cookie survived Render's proxy and a later page
request. The sign-in action also hard-coded `/` as its success destination, while protected pages did
not preserve the requested path when redirecting to login.
**Fix:** sign-in now uses a same-origin POST route that validates the key, attaches the 30-day httpOnly
cookie directly to the 303 response, and redirects to a strictly validated `next` path. Middleware
captures the original protected path before login. A real HTTP cookie-jar probe opened all nine
protected destinations with the same session.
**Watch for later:** auth acceptance requires a fresh browser/session test of login → requested page →
every protected navigation → logout, with cookie Path, Secure, httpOnly and SameSite attributes checked;
a successful credential-validation call alone is not a successful dashboard login.

## 2026-07-21 — Provider/infrastructure keys cannot sign into a Blindspot project
**What happened:** dashboard sign-in failed when a key from Blindspot's own `.env` was used.
**Root cause:** that file has no `BLINDSPOT_API_KEY`; it contains infrastructure and model-provider
credentials. Dashboard authentication requires a `bs_live_…` project key stored as a hash in the same
production database used by the hosted gateway. GSTPilot's working project key lives in GSTPilot's
server-only environment.
**Fix:** validated the GSTPilot key against hosted `/v1/me` without printing it, copied it directly to
the user's clipboard, and clarified the beta onboarding guide.
**Watch for later:** always name both the credential type and its source: invite/project key for human
sign-in, separate project key for the app, provider key only for model calls. Never say “API key” alone.

## 2026-07-21 — A local schema push does not migrate Render's database
**What happened:** native beta feedback passed locally, but the production service uses a different
`DATABASE_URL`. Applying the additive table through the developer `.env` therefore did not prepare
Render for the new endpoint.
**Root cause:** application deployment and database migration are separate release steps, and the
prototype has no deploy-time migration command yet.
**Fix:** retrieved Render's configured database value into a secret-only shell variable, applied the
same Drizzle schema without printing it, unset the value, redeployed, then proved the versioned health
feature and authenticated feedback endpoint live.
**Watch for later:** every schema-changing checkpoint needs three explicit proofs: migration file in
git, target production database migrated, and new endpoint exercised. Phase 8 should run reviewed,
forward-only migrations as a release job instead of an operator `db:push`.

## 2026-07-21 — A child span exposed an empty database update only in production
**What happened:** hosted GSTPilot answered normally, but Blindspot recorded only the pipeline root.
The app logged an ingest 500 and the gateway logged `No values to set` for every ordinary child span.
**Why chain:** the execution already existed → a normal child deliberately carried no workflow-level
status/session/metadata → the conflict-update object became empty → Drizzle [the typed database layer]
rejects an update with zero fields. Local lifecycle coverage had checked SDK payload semantics but had
not persisted a root followed by an ordinary child. Deepest cause: `partial write path` — batch items
were individually transactional, so the root committed while child-only conflict handling was untested.
**Action:** every execution conflict update now includes its existing external ID as a harmless no-op;
status is still changed only when the app explicitly owns the request boundary. The zero-token
integration test now persists a completed root and late child, asserting both spans exist and the
execution remains completed.
**Preventive action:** test ingest batches by span role (root, ordinary child, error child, late child),
not just by schema shape. Best-effort telemetry needs an app log plus a gateway log and an end-to-end
node-count assertion; a successful application response does not prove observability succeeded.

## 2026-07-21 — Database-backed operator commands must exit after success
**What happened:** the beta invite probe created its project/key but the terminal did not return.
**Root cause:** the one-shot script opened the shared Postgres client, whose live socket kept Node's
event loop running after `main()` resolved. The same process-lifecycle trap was already known from
earlier verification scripts but had not been applied to the new operator command.
**Fix:** the invite CLI now exits explicitly with status 0 after successful output; failure still exits
1. The feedback review CLI already follows the same pattern.
**Watch for later:** every database-backed `apps/*/src/scripts` entry point must have an explicit
success and failure termination path until the database package exposes a shared graceful close.

## 2026-07-21 — A local workspace dependency is not a deployable SDK release
**What happened:** GSTPilot worked locally with `link:../Projects/Blindspot_v1/packages/sdk`, but its
Render build checks out only the GSTPilot repository and cannot see a sibling folder.
**Root cause:** the package link described one developer's filesystem, not an artifact the hosted app
could install.
**Fix:** package SDK 0.1.0 into a versioned tarball, vendor it in GSTPilot for a pinned production build,
serve the same verified artifact from the Blindspot dashboard for beta testers, and document its
SHA-256 checksum. npm publication remains the general-availability distribution path.
**Watch for later:** verify every connector from a clean checkout that contains no sibling repos; version
the artifact, pin its integrity, and keep its public API backward-compatible before inviting users.

## 2026-07-21 — Do not run `corepack enable` in Render's read-only runtime
**What happened:** both Render services failed before dependency installation with `EROFS` while
Corepack attempted to unlink `/usr/bin/pnpm`.
**Root cause:** Render's Node runtime already exposes `pnpm` in a read-only system path; `corepack
enable` is a machine-level shim installation command and therefore cannot mutate that path.
**Fix:** call `pnpm install --frozen-lockfile` directly in the Blueprint and live service build commands.
**Watch for later:** deployment build commands should use the package manager supplied by the runtime;
do not add global installer or shim mutation steps unless the platform explicitly requires them.

## 2026-07-21 — Screening, workflow evidence, drift and application state are different truths
**What happened:** the user could not tell whether Routes included deterministic code, what the
manual drift number meant, why a 72% score existed, why “explore cheaper models” produced no usable
approval, or which golden input/output had actually been judged. Approving an observe-only
Recommendation could also make the Blindspot route look switched even though GSTPilot still called
its hard-coded model. **Why chain:** workflow nodes and model Routes shared vocabulary → direct model
calls were presented like real app execution → a judge-owned overall number hid the visible criteria →
simulation wrote eval-shaped data → recommendation/application state did not encode who controlled
routing. Deepest cause: `design` — discovery, screening evidence, production evidence and rollout were
collapsed into one optimistic happy path.
**Action:** Workflow Map now shows every node kind while Routes contains generation nodes only;
connections explicitly store observe-only vs managed; eval plans store model-only vs protected
workflow replay; only complete replay evidence can recommend a switch; scores are the equal-weight
mean of displayed criteria; every example is a table row with label/input/expected/output/score/issues;
the golden flow is a four-step consent-aware wizard with CSV/JSON/JSONL plus Markdown/text context;
drift has live operational, consented live semantic and golden-eval lanes, while simulations are
quarantined from history/evals/Recommendations. Observe-only approval now means awaiting rollout.
**Preventive action:** every evidence-producing feature must name (1) what actually executed, (2) what
data consent applied, (3) how the number is calculated and (4) whether Blindspot or the application
owns the final state transition. Demo/synthetic data must carry a source and never enter policy input.

## 2026-07-21 — Shown-once project keys need a complete rotation path
**What happened:** a local browser diagnostic exposed an active `bs_live_` project key. The database
correctly stored only its hash, but Settings could mint/list keys without revoking one. **Why chain:** a
shown-once credential still lived in the connected app environment → diagnostics crossed the secret
boundary → the product lacked the final revocation operation. Deepest cause: `security lifecycle` — key
creation existed without replacement verification and revocation.
**Action:** added tenant-scoped key revocation, protects the final key from accidental lockout, exposed
the action in Settings, minted and verified a replacement, updated the git-ignored GSTPilot environment
without displaying it, and revoked the exposed key. Temporary browser auth state was scrubbed.
**Preventive action:** never type or print bearer credentials through browser automation; use
permission-restricted state only when unavoidable and scrub it immediately. Every credential feature
must ship create/list/revoke together, and any diagnostic exposure triggers rotation before handoff.

## 2026-07-21 — Environment variables do not create observability by themselves
**What happened:** the user asked questions in local gstpilot but Blindspot still showed zero workflows.
The key authenticated, yet no application code called the SDK. The first bridge test then exposed three
local integration traps: the package manifest had changed without an installed symlink, Turbopack fenced
module resolution at the gstpilot folder, and Node rejected Supabase's incomplete certificate chain.
**Why chain:** env values only configure a client → no client was instantiated → the central Langfuse
wrapper remained the sole observer. After adding it, the linked SDK existed outside Turbopack's root;
after resolving that, the request still died creating its database thread because the dev command lacked
the project's CA bundle. Deepest cause: `integration` — configuration presence had been mistaken for a
runtime end-to-end connector.
**Action:** linked and installed `@blindspot/sdk`, dual-instrumented gstpilot's one `recordGeneration`
helper, expanded the local Turbopack root, started gstpilot with its established CA bundle, added a
metadata-only pipeline root plus non-blocking terminal flush, and made ordinary child spans omit
lifecycle status so a late post-answer memory node cannot reopen a completed run. Three real questions
stored three executions and four generation routes across Haiku/Sonnet; the exemplar is `completed`.
**Preventive action:** connector acceptance must prove zero-workflow baseline → real host-app request →
persisted terminal execution with node/model/token/latency evidence. Verify the package at runtime, not
only in `package.json`; always instrument a request boundary, not only child model calls.

## 2026-07-18 — A model swap needs one comparable evidence cohort
**What happened:** Power Coding FMEA found that the manual recommendation path could reuse legacy
aggregate-only eval rows, and a candidate-only plan could propose a swap without evaluating the live
model on the same cases. Unknown live pricing was also represented as a 100% saving, which could satisfy
an opted-in auto-approve rule. **Why chain:** averages looked complete → old rows had zero planned and
zero scored examples → equality alone passed → recommendation selection was route-wide rather than tied
to one authorization plan. Deepest cause: `design` — evidence completeness and comparability were treated
as separate display concerns instead of one decision boundary.
**Action:** bind every recommendation to one completed eval plan; require non-empty, failure-free,
per-example criteria and paired live/candidate outputs on the same sample; make unknown cost nullable and
ineligible for cost optimization or auto-approval. Added zero-token regressions for legacy aggregates,
candidate-only plans, stale approvals, concurrent golden versions, and cross-route trace promotion.
**Preventive action:** any future policy input must carry its authorization/cohort identity; never infer a
saving or live-model delta from missing data.

## 2026-07-18 — Local dev servers are session processes, not a durable deployment
**What happened:** the user reported localhost was not working after it had previously been verified.
Restarting the gateway and dashboard restored `/healthz` and `/login`.
**Why chain:** the URLs had worked → the original dev processes no longer served them → they belonged to
prior long-running terminal sessions → there is no local process supervisor. Deepest cause: `process` —
an active-session health check was mistaken for durable availability.
**Action:** terminated only the stale service PIDs, restarted both apps, and verified HTTP 200 responses.
During QA, the old dashboard process also returned `/login` 404 after the Next.js upgrade until it was
restarted on 15.5.18. Running `next build` while `next dev` was active then replaced shared `.next`
manifests and caused a temporary 500; a clean dev restart restored HTTP 200.
**Preventive action:** every localhost handoff must include the exact start commands and a fresh endpoint
check; stop/restart Next dev around production builds and dependency changes; never imply a Codex process
will survive sessions.

## 2026-07-18 — Paid eval approval must be an immutable server object
**What happened:** Phase 7C needed to let a user lower an eval budget without hiding what the
smaller run would skip, while old eval, drift and CI endpoints could still contact providers directly.
**Why chain:** disabling a dashboard button did not authorize spend → because HTTP callers could bypass
the UI → because the previous eval job carried only a route/model, not the exact approved cases and cap.
Deepest cause: `design` — spend consent was treated as an interaction instead of durable state.
**Action:** added expiring single-use eval plans with model/route ownership, conservative costs, exact
snapshotted examples, stable stratified sampling, content hash, row lock and per-model caps. Closed every
legacy paid endpoint; persisted per-example evidence; incomplete results cannot recommend or switch.
**Preventive action:** any future scheduled drift/CI/worker path must consume the same plan authorization;
no provider eval call may be added behind a separate boolean or UI-only confirmation.

## 2026-07-18 — Provider catalog evidence must be bound to the current account key
**What happened:** Phase 7B FMEA found that replacing a provider key while a catalog sync was in
flight could certify the old account's models for the new key.
**Why chain:** sync decrypted the key before the network call → the provider response arrived later →
the registry transaction did not prove the key was still the same. Deepest cause: `state` — account
availability is evidence tied to a credential version, not merely to a project/provider pair.
**Action:** key replacement/removal now atomically invalidates registry verification; sync locks the
provider-key row and compares its encrypted value before writing. Catalog reads also have a fail-safe
timeout and streaming 5 MB cap.
**Preventive action:** every future provider probe must bind its result to the credential version that
started it; an account change always requires a fresh probe before experiment eligibility.

## 2026-07-18 — Route optimizer expanded into an agent-workflow improvement workspace
**What happened:** The approved v1 could optimize manually named gateway Routes, but the user clarified
that Blindspot must first connect to an already-built agent, discover its workflows/nodes, retain data
only by user choice, and offer only technically compatible model experiments.
**Why chain:** routes were flat → because the gateway only saw model calls → because no SDK/OTel span
hierarchy existed → because the initial PRD optimized routing before workflow discovery. Deepest why:
`design` — the product unit expanded from a call-site to workflow → node → route.
**Action:** added a provider-agnostic SDK/ingestion contract, workflow hierarchy, explicit selection and
capture controls, environment-scoped route linking, and documented technical-vs-behavioral compatibility.
**Preventive action:** every future connector must emit the same Zod span contract; model eligibility is
always per node, and discovery/capture/changes remain three separate user permissions.

## 2026-07-18 — One-shot DB verification scripts did not exit automatically
**What happened:** the first synthetic end-to-end probe hung before starting the gateway even though its
database inserts completed.
**Why chain:** command substitution waited → the `tsx` process stayed alive → the Postgres client kept an
open socket → the one-shot script did not explicitly terminate it. Deepest why: `process` lifecycle.
**Action:** terminated only the test PIDs, removed the temporary project, then made every one-shot DB probe
call `process.exit(0)` after completion. The rerun passed and cleaned up.
**Preventive action:** repository CLIs should expose a shared graceful DB close; until then, ephemeral
verification scripts must explicitly exit and always clean test projects by a unique `user_id`.

## 2026-07-16 — Adding the dashboard: pnpm `allowBuilds` + Next server-only key handling
**What happened:** (1) Every `pnpm --filter @blindspot/dashboard <script>` aborted with
`ERR_PNPM_IGNORED_BUILDS: sharp` before the script even ran. (2) Design decision on where the
`bs_live_` key lives so it never leaks to the browser.
**Root cause / decision:** (1) `pnpm-workspace.yaml` has an `allowBuilds:` policy map; the setup left
`sharp: set this to true or false` — an unresolved value, so pnpm treated sharp's native build as an
un-decided ignored build and pnpm's pre-run deps check exits non-zero. sharp is a Next image-optim dep
we don't need. (2) The dashboard is a **pure HTTP client of /v1** — the key is held in an **httpOnly
cookie**, read only in Server Components / Server Actions (`lib/session.ts`), and every gateway call is
proxied server-side via `lib/api.ts`. Client components never receive the key.
**Fix:** set `sharp: false` in `allowBuilds` (Next runs fine without it; no `next/image` remote optim).
For the key: `requireApi()` reads the cookie server-side and returns a bound client; mutations are Server
Actions that also read the cookie — the browser bundle has no token.
**Watch for later:** any new native-build dep (esbuild, sharp, bcrypt…) must get an explicit
true/false in `allowBuilds` or `pnpm --filter` runs break. If a dashboard page needs data, fetch it in a
Server Component / Server Action — never `fetch` the gateway from a client component with the key.

## 2026-07-16 — FMEA: golden-set endpoints leaked across tenants (IDOR)
**What happened:** FMEA (on feature-complete) found the golden-set/example/trace endpoints resolved by
`:id` with **no project ownership check** — any project could read/edit/delete another's golden data by id.
**Root cause:** only the recommendations endpoints checked ownership; the golden router trusted the id.
**Fix:** added `goldenSetProjectId` / `goldenExampleProjectId` / `traceProjectId` (join id → route → project)
in `packages/core/src/golden/service.ts`; every id-based golden handler now 404s if the resource isn't the
caller's. Verified: Project B → 404 on Project A's set.
**Watch for later:** EVERY new `/:id` endpoint must scope by `c.get("projectId")` — never trust an id alone.

## 2026-07-16 — Eval scores implausibly low; stronger model scored lower than weaker
**What happened:** back-testing gave avg scores ~0.13–0.27, and Groq 70B scored *below* Groq 8B.
Judge, tested in isolation, was perfect (good summary → 0.9, irrelevant text → 0.0).
**Root cause:** the **Golden Set Agent generated `input` as a bare passage** (no instruction). `runEval`
sends `messages: [{ role: "user", content: example.input }]` with no system prompt, so the candidate
never learns it should *summarize* — it just replies conversationally, which the judge (correctly) scores
near zero. Not a judge bug — a **golden-data bug**: inputs must be self-contained task prompts.
**Fix:** agent prompt now requires each `input` to embed the instruction (e.g. "Summarize the following…:
<passage>"), matching how a real app / promoted trace looks.
**Watch for later:** `promoteTrace` currently keeps only the last user message — if an app relied on a
system prompt, the promoted golden input would also lose the instruction. Preserve full messages there
(future). If eval scores look uniformly low, check whether golden `input`s are self-contained.

## 2026-07-16 — DATABASE_URL must live in `.env`, not `.env.example`
**What happened:** a real Supabase `DATABASE_URL` (with password) was written into `.env.example`.
**Root cause:** `.env.example` is the committed, blank template; the app loads secrets from `.env` only
(`loadRootEnv` in `packages/shared/src/env.ts` finds `pnpm-workspace.yaml` then loads the sibling `.env`).
A value in `.env.example` is (a) ignored by the app and (b) a credential leak once committed.
**Watch for later:** if `db:push`/bootstrap can't connect but you "set" DATABASE_URL, check it's in `.env`.
Keep `.env.example` blank; never commit real secrets.

## 2026-07-16 — Worker typecheck failed: duplicate ioredis (bullmq pins exact)
**What happened:** `pnpm typecheck` failed in `apps/worker` — `Type 'Redis' is not assignable to
type 'ConnectionOptions'`, complaining across `ioredis@5.11.1` vs `ioredis@5.10.1`.
**Root cause:** `bullmq` depends on **exactly `ioredis@5.10.1`**, but the worker declared
`ioredis@^5.4.2` which resolved to `5.11.1`. Two copies → two nominally-different `Redis` classes
(ioredis uses `protected` members, which are compared nominally), so passing our `IORedis` instance
into BullMQ's `Worker({ connection })` was a type mismatch. Not a code bug — a version-dedupe bug.
**Fix:** pin the worker's `ioredis` to `5.10.1` (match bullmq) so pnpm installs one shared copy.
**Watch for later:** any BullMQ upgrade may re-pin ioredis; if this type error returns, re-check
`node_modules/.pnpm/bullmq@*/.../package.json` → `dependencies.ioredis` and match it (or add a root
`pnpm.overrides` for ioredis).

## 2026-07-16 — Project kickoff & naming standardization
**What happened:** Blindspot began from a PRD that still carried residual `evaldrift` naming
(`ed_live_…` API keys, `ed_` framing) from an earlier design. User approved standardizing to
**Blindspot / `bs_`** everywhere.
**Root cause:** the product was renamed evaldrift → Blindspot; only the wordmark was meant to
change, but identifiers lagged.
**Watch for later:** if you see `ed_` / `evaldrift` in generated code or the DB schema, it is a
leak — rename to `bs_` / Blindspot. Project-issued gateway keys are `bs_live_…`.

## 2026-07-18 — A Redis CLI command is not a REDIS_URL
**What happened:** copying the source project's `REDIS_URL` made ioredis fail with `EINVAL`; its
automatic error event included the credential-bearing connection string in diagnostic output.
**Why chain:** the variable held a full `redis-cli --tls -u …` command → Blindspot copied the raw
value → ioredis interpreted the command as a URL → its default unhandled-error logger printed the
malformed target. Deepest cause: `process` — configuration was checked for presence, not shape,
and the first verification client did not install a redacting error listener.
**Action:** extracted only the Redis URL, promoted it to `rediss://`, stored it in Blindspot's
git-ignored `.env`, restricted the file to mode 600, and rechecked with credential-bearing errors
suppressed. Postgres, Redis and the Anthropic credential then validated without paid calls.
**Preventive action:** validate URL scheme/host before constructing network clients; treat copied
CLI snippets as user input; attach a redacting error listener before the first connection attempt.
Rotate credentials whenever any diagnostic output contains them, even in a local session.

## 2026-10-01 — Metrics fixtures must use the same explicit clock
**What happened:** the original metrics test returned null feedback percentage while expecting100%.
**Root cause:** executions and measurement windows used a fixed July22 clock, but feedback inserted through the real service retained today's PostgreSQL timestamp. Those rows correctly fell outside the measured window.
**Fix:** explicitly date all four synthetic feedback rows into the fixture window before the existing down-vote backdate. Keep the fixed clock, runtime filtering and every assertion unchanged. The native metrics check now passes.
**Watch for later:** every timestamped record participating in a fixed-clock integration test must use that fixture clock; a wall-clock default makes otherwise deterministic tests expire.
