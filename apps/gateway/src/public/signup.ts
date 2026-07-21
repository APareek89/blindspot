import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  createSignupProject,
  SignupConflictError,
  SignupInviteError,
  verifySignupInvite,
} from "@blindspot/core";
import type { Env } from "../types";

const SignupRequestSchema = z.object({
  inviteToken: z.string().min(40).max(2048),
});

export const publicSignupRouter = new Hono<Env>();

publicSignupRouter.use(
  "*",
  bodyLimit({
    maxSize: 4096,
    onError: (c) => c.json({ error: { message: "signup request is too large" } }, 413),
  }),
);

function inviteFailure(error: unknown) {
  if (error instanceof SignupInviteError) {
    if (error.code === "expired") return { status: 410 as const, message: error.message };
    if (error.code === "config") return { status: 503 as const, message: "signup is temporarily unavailable" };
    return { status: 401 as const, message: "invalid signup invitation" };
  }
  return null;
}

publicSignupRouter.post("/signup/preview", async (c) => {
  c.header("Cache-Control", "no-store");
  const parsed = SignupRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { message: "invalid signup request" } }, 400);
  try {
    const claims = verifySignupInvite(parsed.data.inviteToken);
    return c.json({
      invite: {
        owner: claims.owner,
        project: claims.project,
        expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
      },
    });
  } catch (error) {
    const failure = inviteFailure(error);
    if (failure) return c.json({ error: { message: failure.message } }, failure.status);
    return c.json({ error: { message: "signup preview failed" } }, 500);
  }
});

publicSignupRouter.post("/signup", async (c) => {
  c.header("Cache-Control", "no-store");
  const parsed = SignupRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { message: "invalid signup request" } }, 400);
  try {
    const result = await createSignupProject(parsed.data.inviteToken);
    return c.json({
      project: result.project,
      recoveryKey: result.recoveryKey,
      applicationKey: result.applicationKey,
      replayed: result.replayed,
    });
  } catch (error) {
    const failure = inviteFailure(error);
    if (failure) return c.json({ error: { message: failure.message } }, failure.status);
    if (error instanceof SignupConflictError) {
      return c.json({ error: { message: error.message } }, 409);
    }
    console.error("[signup] project creation failed");
    return c.json({ error: { message: "signup failed" } }, 500);
  }
});
