# Invite-only beta onboarding

The beta is invite-only and self-serve after the link: every company receives an expiring signup link
bound to one email and project. There is no uninvited signup, shared project or billing in this phase.

## 1. Blindspot operator — create the invite

Run from the Blindspot repository with `ENCRYPTION_KEY` available in the git-ignored environment:

```bash
pnpm --filter @blindspot/gateway signup-link -- \
  --owner "owner@example.com" \
  --project "Acme support agent" \
  --days 7
```

The command does not create a project. It displays one signed link bound to that recipient/project;
the token is stored after `#` so browsers do not send it in HTTP or referrer logs. Send the full link
through a secure channel. Never paste it into an issue, shared log, screenshot or public chat. The
manual `invite` command remains an operator fallback when link signup is unavailable.
If creation succeeds but the response is lost, the same link can recover the identical keys for five
minutes. After that retry window it reports “already used” and cannot reveal the keys again.

Review submitted feedback from the operator's trusted terminal (the output contains tester-authored
text, so do not pipe it into shared logs):

```bash
pnpm --filter @blindspot/gateway feedback -- --limit 25
```

## 2. Tester — smooth signup and separate access

1. Open the complete signup link and verify the locked email/project.
2. Choose **Create workspace**. Blindspot creates separate recovery and application keys and signs in.
3. Copy the recovery key to a password manager; never put it in the application.
4. Copy the application environment block, confirm both are saved, then continue to Connect.
5. Add a provider key only when ready for paid model evals; observability itself does not require it.

Both credentials are `bs_live_…` project keys created by Blindspot, but they have separate operational
lifecycles: recovery is for the human; application is revocable server configuration. Do not use
`ANTHROPIC_API_KEY`, `DATABASE_URL`, `ENCRYPTION_KEY`, or any other value from the Blindspot server's
own `.env`; those are infrastructure/provider credentials and cannot authenticate a project. For the
existing GSTPilot test, the working project key is its server-only `BLINDSPOT_API_KEY` in the GSTPilot
repository/Render service—not in the Blindspot repository `.env`.

## 3. Tester — install the TypeScript connector

During the private beta, the versioned package is served by the Blindspot dashboard:

```bash
pnpm add https://blindspot-dashboard.onrender.com/blindspot-sdk-0.1.0.tgz
```

SHA-256:

```text
7d7c0fbfa54c3cb62c74da77520214264b54affd4fac46178b50fdbf8e3200a2
```

This temporary distribution path makes the beta reproducible without registry credentials. Publish
`@blindspot/sdk` to npm before general availability.

## 4. Tester — configure the hosted application

```dotenv
BLINDSPOT_API_KEY=<the application key copied during signup>
BLINDSPOT_BASE_URL=https://blindspot-gateway.onrender.com
BLINDSPOT_ENVIRONMENT=production
BLINDSPOT_CAPTURE=metadata
BLINDSPOT_ROUTING=observe_only
```

Environment variables do not emit telemetry by themselves. Initialize `Blindspot.fromEnv()` once,
wrap the shared model-call helper with `observeGeneration()`, create deterministic spans where useful,
and call `flush()` at the request/process boundary. The Connect screen contains copyable code.

The minimum application pattern is:

```ts
import { Blindspot } from "@blindspot/sdk";

export const blindspot = Blindspot.fromEnv({
  workflow: "my-agent",
  framework: "custom",
  language: "typescript",
  onError: (error) => console.warn("[blindspot]", error.message),
});

// Put this around the shared helper that already makes every LLM call.
export async function observedGeneration(executionId: string, input: unknown) {
  return blindspot.observeGeneration(
    {
      executionId,
      node: "answer-writer",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      input,
    },
    () => existingModelCall(input),
  );
}
```

At the real request boundary, end one root `kind: "agent"` span with
`executionStatus: "completed"` (or `"error"`) and `await blindspot.flush()`. Reuse the same
`executionId` for the root and its child calls. Telemetry is best-effort: an ingest failure is reported
through `onError`, but must not break the user's application response.

## 5. Verify before sharing more data

1. Deploy the application.
2. Send one identifiable test request that contains no customer data.
3. Reload Blindspot Connect; it should show the workflow, environment, nodes and latest-seen time.
4. Check Workflows and confirm the expected model nodes and execution count.
5. Only then decide whether Inputs or Full capture is appropriate.

If no workflow appears, check the application logs for a redacted `[blindspot]` warning, confirm the
five environment-variable names are present, and verify the SDK wrapper actually ran.

`GET https://blindspot-gateway.onrender.com/healthz` is public and returns the API version plus
connector features; it never returns project configuration or credentials.

## 6. Give feedback

Use the dashboard's Beta feedback screen. Report the stage, expected behavior, actual behavior and
impact. The submission is stored inside the signed-in Blindspot project; the screen shows its recent
submissions. Blindspot does not attach logs or screenshots automatically. Remove project/provider keys,
prompts, outputs, customer identifiers and personal data from anything you type.

## What the beta does not claim yet

- TypeScript has the native observe-existing-agent SDK; Python can use the OpenAI-compatible gateway,
  but does not yet have an equivalent native observability SDK.
- Observe-only cannot switch a live model. Managed routing requires `resolveModel()` at every model
  boundary plus protected workflow replay.
- Redis-backed crash recovery, production rate limits and external alerting remain Phase 8.
