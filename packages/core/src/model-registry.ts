/**
 * Project-scoped model registry and per-node compatibility gate.
 *
 * Provider sync establishes account availability without inference. Compatibility is
 * derived from the strictest observed workflow-node requirements; quality remains a
 * separate golden-set gate and live routing remains approval-controlled.
 */
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import {
  candidates,
  getDb,
  modelRegistry,
  providerKeys,
  workflowNodes,
  workflows,
} from "@blindspot/db";
import { listProviderModels, pricePerMillion } from "@blindspot/providers";
import {
  decryptSecret,
  ModelCapabilitiesSchema,
  NodeRequirementsSchema,
  type CompatibilityStatus,
  type ModelCapabilities,
  type NodeRequirements,
  type RegistryProvider,
} from "@blindspot/shared";
import { getOwnedRoute } from "./routes/service";

export const PROTOTYPE_MODEL_REFS = [
  "anthropic:claude-sonnet-4-6",
  "anthropic:claude-haiku-4-5-20251001",
] as const;

interface CuratedModel {
  modelRef: (typeof PROTOTYPE_MODEL_REFS)[number];
  provider: RegistryProvider;
  providerModelId: string;
  displayName: string;
  capabilities: ModelCapabilities;
}

const CURATED_MODELS: CuratedModel[] = [
  {
    modelRef: "anthropic:claude-sonnet-4-6",
    provider: "anthropic",
    providerModelId: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    capabilities: ModelCapabilitiesSchema.parse({
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
      systemMessages: true,
      contextTokens: 1_000_000,
      maxOutputTokens: 128_000,
    }),
  },
  {
    modelRef: "anthropic:claude-haiku-4-5-20251001",
    provider: "anthropic",
    providerModelId: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5",
    capabilities: ModelCapabilitiesSchema.parse({
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      toolCalling: true,
      structuredOutput: true,
      streaming: true,
      systemMessages: true,
      contextTokens: 200_000,
      maxOutputTokens: 64_000,
    }),
  },
];

export class MissingProviderKeyError extends Error {
  constructor(public readonly provider: RegistryProvider) {
    super(`Add a ${provider} provider key before syncing its model catalog`);
    this.name = "MissingProviderKeyError";
  }
}

/** Sync account-visible models. Listing/probing is read-only and consumes zero model tokens. */
export async function syncModelRegistry(projectId: string, provider: RegistryProvider) {
  const keyAtStart = (
    await getDb()
      .select({ encryptedKey: providerKeys.encryptedKey })
      .from(providerKeys)
      .where(and(eq(providerKeys.projectId, projectId), eq(providerKeys.provider, provider)))
      .limit(1)
  )[0];
  if (!keyAtStart) throw new MissingProviderKeyError(provider);

  const discovered = await listProviderModels(provider, decryptSecret(keyAtStart.encryptedKey));
  if (discovered.length === 0) {
    throw new Error(`${provider} returned an empty model catalog; existing entries were preserved`);
  }
  const db = getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    // Lock and re-check the key after the external request. If an account key changed while the
    // catalog was in flight, never certify the prior account's models for the replacement key.
    const currentKey = (
      await tx
        .select({ encryptedKey: providerKeys.encryptedKey })
        .from(providerKeys)
        .where(and(eq(providerKeys.projectId, projectId), eq(providerKeys.provider, provider)))
        .limit(1)
        .for("update")
    )[0];
    if (!currentKey || currentKey.encryptedKey !== keyAtStart.encryptedKey) {
      throw new Error("provider key changed during model sync; retry the sync");
    }
    const seen = discovered.map((model) => model.modelRef);
    await tx
      .update(modelRegistry)
      .set({ availability: "unavailable", lastSyncedAt: now })
      .where(
        and(
          eq(modelRegistry.projectId, projectId),
          eq(modelRegistry.provider, provider),
          notInArray(modelRegistry.modelRef, seen),
        ),
      );

    for (const model of discovered) {
      await tx
        .insert(modelRegistry)
        .values({
          projectId,
          provider: model.provider,
          modelRef: model.modelRef,
          providerModelId: model.providerModelId,
          displayName: model.displayName,
          source: model.source,
          availability: model.availability,
          capabilitiesJson: model.capabilities,
          inputUsdPerMillion: model.inputUsdPerMillion,
          outputUsdPerMillion: model.outputUsdPerMillion,
          providerCreatedAt: model.providerCreatedAt ?? undefined,
          deprecatedAt: model.deprecatedAt ?? undefined,
          lastSyncedAt: now,
          lastProbedAt: now,
          probeStatus: model.probeStatus,
        })
        .onConflictDoUpdate({
          target: [modelRegistry.projectId, modelRegistry.modelRef],
          set: {
            providerModelId: model.providerModelId,
            displayName: model.displayName,
            source: model.source,
            availability: model.availability,
            capabilitiesJson: model.capabilities,
            inputUsdPerMillion: model.inputUsdPerMillion,
            outputUsdPerMillion: model.outputUsdPerMillion,
            providerCreatedAt: model.providerCreatedAt,
            deprecatedAt: model.deprecatedAt,
            lastSyncedAt: now,
            lastProbedAt: now,
            probeStatus: model.probeStatus,
          },
        });
    }
  });

  return {
    provider,
    discovered: discovered.length,
    prototypeModels: discovered.filter((model) =>
      (PROTOTYPE_MODEL_REFS as readonly string[]).includes(model.modelRef),
    ).length,
    syncedAt: now,
    tokenCost: 0,
  };
}

/** Registry overview for Settings; never returns provider credentials or raw provider payloads. */
export async function listModelRegistry(projectId: string) {
  const [models, keyRows] = await Promise.all([
    getDb()
      .select()
      .from(modelRegistry)
      .where(eq(modelRegistry.projectId, projectId))
      .orderBy(desc(modelRegistry.lastSyncedAt)),
    getDb()
      .select({ provider: providerKeys.provider })
      .from(providerKeys)
      .where(eq(providerKeys.projectId, projectId)),
  ]);
  const configured = new Set(keyRows.map((row) => row.provider));
  const providers = (["anthropic", "hf", "fireworks"] as const).map((provider) => {
    const providerModels = models.filter((model) => model.provider === provider);
    return {
      provider,
      keyConfigured: configured.has(provider),
      modelCount: providerModels.filter((model) => model.availability === "available").length,
      verifiedCount: providerModels.filter((model) => model.probeStatus === "verified").length,
      lastSyncedAt: providerModels[0]?.lastSyncedAt ?? null,
    };
  });
  return {
    providers,
    models: models.map((model) => ({
      id: model.id,
      provider: model.provider,
      modelRef: model.modelRef,
      displayName: model.displayName,
      availability: model.availability,
      capabilities: model.capabilitiesJson,
      probeStatus: model.probeStatus,
      lastSyncedAt: model.lastSyncedAt,
    })),
  };
}

function checkBoolean(
  required: boolean,
  supported: boolean | null,
  label: string,
  incompatible: string[],
  unknown: string[],
) {
  if (!required) return;
  if (supported === false) incompatible.push(`${label} is required but unsupported`);
  if (supported === null) unknown.push(`${label} support is not verified`);
}

function evaluateRequirements(requirements: NodeRequirements, capabilities: ModelCapabilities) {
  const incompatible: string[] = [];
  const unknown: string[] = [];
  for (const modality of requirements.inputModalities) {
    if (!capabilities.inputModalities.includes(modality)) {
      incompatible.push(`${modality} input is required but unsupported`);
    }
  }
  for (const modality of requirements.outputModalities) {
    if (!capabilities.outputModalities.includes(modality)) {
      incompatible.push(`${modality} output is required but unsupported`);
    }
  }
  checkBoolean(
    requirements.toolCalling,
    capabilities.toolCalling,
    "Tool calling",
    incompatible,
    unknown,
  );
  checkBoolean(
    requirements.structuredOutput,
    capabilities.structuredOutput,
    "Structured output",
    incompatible,
    unknown,
  );
  checkBoolean(
    requirements.streaming,
    capabilities.streaming,
    "Streaming",
    incompatible,
    unknown,
  );
  checkBoolean(
    requirements.systemMessages,
    capabilities.systemMessages,
    "System messages",
    incompatible,
    unknown,
  );
  if (requirements.minContextTokens) {
    if (capabilities.contextTokens === null) {
      unknown.push("Context window is not verified");
    } else if (capabilities.contextTokens < requirements.minContextTokens) {
      incompatible.push(
        `Needs ${requirements.minContextTokens.toLocaleString()} context tokens; model has ${capabilities.contextTokens.toLocaleString()}`,
      );
    }
  }
  return { incompatible, unknown };
}

export interface ModelCompatibility {
  modelRef: string;
  provider: RegistryProvider;
  displayName: string;
  status: CompatibilityStatus;
  reasons: string[];
  capabilities: ModelCapabilities;
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  lastSyncedAt: Date | null;
}

async function routeRequirements(projectId: string, routeId: string) {
  const linked = (
    await getDb()
      .select({
        nodeId: workflowNodes.id,
        nodeName: workflowNodes.name,
        requirements: workflowNodes.requirementsJson,
        workflowId: workflows.id,
        workflowName: workflows.name,
        selected: workflows.selected,
        integrationMode: workflows.integrationMode,
        replayEnabled: workflows.replayEnabled,
        replayConfigured: workflows.replayUrl,
      })
      .from(workflowNodes)
      .innerJoin(workflows, eq(workflowNodes.workflowId, workflows.id))
      .where(and(eq(workflowNodes.routeId, routeId), eq(workflows.projectId, projectId)))
      .limit(1)
  )[0];
  return {
    requirements: NodeRequirementsSchema.parse(linked?.requirements ?? {}),
    workflow: linked
      ? {
          id: linked.workflowId,
          name: linked.workflowName,
          selected: linked.selected,
          integrationMode: linked.integrationMode,
          replayReady: Boolean(linked.replayEnabled && linked.replayConfigured),
          nodeId: linked.nodeId,
          nodeName: linked.nodeName,
        }
      : null,
  };
}

/** Eligible/excluded model choices for one route. Only Claude Sonnet/Haiku are exposed in v1. */
export async function getRouteModelCompatibility(projectId: string, routeName: string) {
  const route = await getOwnedRoute(projectId, routeName);
  if (!route) return null;
  const [observed, rows, keyRows] = await Promise.all([
    routeRequirements(projectId, route.id),
    getDb()
      .select()
      .from(modelRegistry)
      .where(
        and(
          eq(modelRegistry.projectId, projectId),
          inArray(modelRegistry.modelRef, [...PROTOTYPE_MODEL_REFS]),
        ),
      ),
    getDb()
      .select({ provider: providerKeys.provider })
      .from(providerKeys)
      .where(eq(providerKeys.projectId, projectId)),
  ]);
  const byRef = new Map(rows.map((row) => [row.modelRef, row]));
  const configured = new Set(keyRows.map((row) => row.provider));

  const models: ModelCompatibility[] = CURATED_MODELS.map((curated) => {
    const row = byRef.get(curated.modelRef);
    const capabilities = row?.capabilitiesJson ?? curated.capabilities;
    const reasons: string[] = [];
    let status: CompatibilityStatus;
    if (!configured.has(curated.provider)) {
      status = "needs_provider_key";
      reasons.push(`Add a ${curated.provider} key in Settings`);
    } else if (row?.availability === "unavailable" || row?.availability === "deprecated") {
      status = "incompatible";
      reasons.push(
        row.availability === "deprecated"
          ? "Provider marks this model deprecated"
          : "Model is not available to this provider account",
      );
    } else {
      const match = evaluateRequirements(observed.requirements, capabilities);
      reasons.push(...match.incompatible, ...match.unknown);
      if (match.incompatible.length > 0) status = "incompatible";
      else if (!row || row.probeStatus !== "verified" || match.unknown.length > 0) {
        status = "needs_verification";
        if (!row) reasons.push("Sync Anthropic in Settings to verify account access");
        else if (row.probeStatus !== "verified") reasons.push("Provider access probe is not verified");
      } else {
        status = "compatible";
        reasons.push("Meets every observed technical requirement");
      }
    }
    const price = pricePerMillion(curated.modelRef);
    return {
      modelRef: curated.modelRef,
      provider: curated.provider,
      displayName: row?.displayName ?? curated.displayName,
      status,
      reasons: [...new Set(reasons)],
      capabilities,
      inputUsdPerMillion: row?.inputUsdPerMillion ?? price?.input ?? null,
      outputUsdPerMillion: row?.outputUsdPerMillion ?? price?.output ?? null,
      lastSyncedAt: row?.lastSyncedAt ?? null,
    };
  });
  return {
    route: { id: route.id, name: route.name, liveModel: route.liveModel },
    workflow: observed.workflow,
    optimizationAllowed: observed.workflow?.selected ?? true,
    optimizationBlockedReason:
      observed.workflow && !observed.workflow.selected
        ? "Select this workflow under Workflows before adding experiment models"
        : null,
    requirements: observed.requirements,
    eligible: models.filter((model) => model.status === "compatible"),
    excluded: models.filter((model) => model.status !== "compatible"),
  };
}

/** The API enforcement side of the compatibility UI; callers cannot bypass it with a raw ref. */
export async function addCompatibleCandidate(
  projectId: string,
  routeName: string,
  modelRef: string,
) {
  const compatibility = await getRouteModelCompatibility(projectId, routeName);
  if (!compatibility) return { ok: false as const, status: 404, error: "route not found" };
  if (!compatibility.optimizationAllowed) {
    return {
      ok: false as const,
      status: 409,
      error: compatibility.optimizationBlockedReason ?? "workflow is observe-only",
    };
  }
  const model = [...compatibility.eligible, ...compatibility.excluded].find(
    (candidate) => candidate.modelRef === modelRef,
  );
  if (!model) {
    return {
      ok: false as const,
      status: 400,
      error: "model is not enabled in the Claude-only prototype",
    };
  }
  if (model.status !== "compatible") {
    return {
      ok: false as const,
      status: 409,
      error: model.reasons[0] ?? `model compatibility is ${model.status}`,
    };
  }
  const route = await getOwnedRoute(projectId, routeName);
  if (!route) return { ok: false as const, status: 404, error: "route not found" };
  const source = model.provider === "hf" ? "hf" : model.provider === "fireworks" ? "aggregator" : "api";
  const inserted = await getDb()
    .insert(candidates)
    .values({ routeId: route.id, modelRef, source, enabled: true })
    .onConflictDoNothing()
    .returning();
  return {
    ok: true as const,
    candidate: inserted[0] ?? { modelRef, note: "already existed" as const },
    backtest: { status: "not_started" as const, reason: "Configure eval budget before spending" },
  };
}
