import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { apiKeys, getDb, projects } from "@blindspot/db";
import { GATEWAY_KEY_PREFIX, hashGatewayKey } from "./keys/gateway";

const INVITE_PREFIX = "bs_signup_v1.";
const MAX_INVITE_AGE_SECONDS = 30 * 24 * 60 * 60;
const LOST_RESPONSE_RETRY_SECONDS = 5 * 60;

export const SignupIdentitySchema = z.object({
  owner: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  project: z.string().trim().min(2).max(100),
});

const SignupInviteClaimsSchema = SignupIdentitySchema.extend({
  version: z.literal(1),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
  nonce: z.string().regex(/^[a-f0-9]{32}$/),
});

export type SignupInviteClaims = z.infer<typeof SignupInviteClaimsSchema>;

export class SignupInviteError extends Error {
  constructor(
    public readonly code: "invalid" | "expired" | "config",
    message: string,
  ) {
    super(message);
    this.name = "SignupInviteError";
  }
}

export class SignupConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignupConflictError";
  }
}

function inviteSecret(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) throw new SignupInviteError("config", "signup is not configured");
  const secret = Buffer.from(hex, "hex");
  if (secret.length !== 32) throw new SignupInviteError("config", "signup is not configured");
  return secret;
}

function signature(payload: string): Buffer {
  return createHmac("sha256", inviteSecret())
    .update(`blindspot-signup-invite-v1:${payload}`)
    .digest();
}

export function createSignupInvite(input: {
  owner: string;
  project: string;
  expiresInSeconds?: number;
  now?: Date;
}): { token: string; claims: SignupInviteClaims } {
  const identity = SignupIdentitySchema.parse(input);
  const issuedAt = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const expiresInSeconds = input.expiresInSeconds ?? 7 * 24 * 60 * 60;
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > MAX_INVITE_AGE_SECONDS) {
    throw new SignupInviteError("invalid", "invite duration must be between 1 minute and 30 days");
  }
  const claims: SignupInviteClaims = {
    ...identity,
    version: 1,
    issuedAt,
    expiresAt: issuedAt + expiresInSeconds,
    nonce: randomBytes(16).toString("hex"),
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const token = `${INVITE_PREFIX}${payload}.${signature(payload).toString("base64url")}`;
  return { token, claims };
}

export function verifySignupInvite(token: string, now = new Date()): SignupInviteClaims {
  if (typeof token !== "string" || token.length > 2048 || !token.startsWith(INVITE_PREFIX)) {
    throw new SignupInviteError("invalid", "invalid signup invitation");
  }
  const parts = token.slice(INVITE_PREFIX.length).split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new SignupInviteError("invalid", "invalid signup invitation");
  }
  const [payload, encodedSignature] = parts;
  let suppliedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    throw new SignupInviteError("invalid", "invalid signup invitation");
  }
  const expectedSignature = signature(payload);
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw new SignupInviteError("invalid", "invalid signup invitation");
  }

  let claims: SignupInviteClaims;
  try {
    claims = SignupInviteClaimsSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  } catch {
    throw new SignupInviteError("invalid", "invalid signup invitation");
  }
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (
    claims.expiresAt <= claims.issuedAt ||
    claims.issuedAt > nowSeconds + 5 * 60 ||
    claims.expiresAt - claims.issuedAt > MAX_INVITE_AGE_SECONDS
  ) {
    throw new SignupInviteError("invalid", "invalid signup invitation");
  }
  if (claims.expiresAt <= nowSeconds) {
    throw new SignupInviteError("expired", "this signup invitation has expired");
  }
  return claims;
}

function deterministicKey(token: string, role: "recovery" | "application") {
  const hex = createHmac("sha256", inviteSecret())
    .update(`blindspot-signup-key-v1:${role}:${token}`)
    .digest("hex")
    .slice(0, 48);
  const key = `${GATEWAY_KEY_PREFIX}${hex}`;
  return { key, prefix: key.slice(0, 12), keyHash: hashGatewayKey(key) };
}

/**
 * Create a metadata-only project with separate recovery/application keys. The signed invite
 * deterministically derives both values, making a network retry idempotent without storing raw keys.
 */
export async function createSignupProject(token: string, now = new Date()) {
  const claims = verifySignupInvite(token, now);
  const recovery = deterministicKey(token, "recovery");
  const application = deterministicKey(token, "application");

  return getDb().transaction(async (tx) => {
    // Serialize one signed email/project pair without a new plaintext invite table.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([claims.owner, claims.project])}, 0))`,
    );
    const existing = (
      await tx
        .select({ id: projects.id, name: projects.name, userId: projects.userId, createdAt: projects.createdAt })
        .from(projects)
        .where(and(eq(projects.userId, claims.owner), eq(projects.name, claims.project)))
        .limit(1)
    )[0];

    if (existing) {
      const hashes = await tx
        .select({ keyHash: apiKeys.keyHash })
        .from(apiKeys)
        .where(eq(apiKeys.projectId, existing.id));
      const ownsBothDerivedKeys = [recovery.keyHash, application.keyHash].every((expected) =>
        hashes.some((row) => row.keyHash === expected),
      );
      if (!ownsBothDerivedKeys) {
        throw new SignupConflictError("a project with this owner and name already exists");
      }
      if (now.getTime() - existing.createdAt.getTime() > LOST_RESPONSE_RETRY_SECONDS * 1000) {
        throw new SignupConflictError("this invitation was already used; sign in with the saved recovery key");
      }
      return {
        project: { id: existing.id, name: existing.name, userId: existing.userId },
        recoveryKey: recovery.key,
        applicationKey: application.key,
        replayed: true,
      };
    }

    const project = (
      await tx
        .insert(projects)
        .values({ userId: claims.owner, name: claims.project, captureMode: "metadata" })
        .returning({ id: projects.id, name: projects.name, userId: projects.userId })
    )[0]!;
    await tx.insert(apiKeys).values([
      { projectId: project.id, prefix: recovery.prefix, keyHash: recovery.keyHash },
      { projectId: project.id, prefix: application.prefix, keyHash: application.keyHash },
    ]);
    return {
      project,
      recoveryKey: recovery.key,
      applicationKey: application.key,
      replayed: false,
    };
  });
}
