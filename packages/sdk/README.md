# @blindspot/sdk

Lightweight TypeScript connector for Blindspot workflow telemetry, explicit context sharing and
approval-gated managed model resolution.

Private beta install:

```bash
pnpm add https://blindspot-dashboard.onrender.com/blindspot-sdk-0.1.0.tgz
```

```ts
import { Blindspot } from "@blindspot/sdk";

const blindspot = new Blindspot({ workflow: "my-agent" });
const modelRef = await blindspot.resolveModel("answer", "anthropic:claude-sonnet-4-6");
```

Required environment variables are `BLINDSPOT_API_KEY` and `BLINDSPOT_BASE_URL`. Capture defaults
to metadata-only and routing defaults to observe-only. See the repository Connect screen for the
full integration contract.
