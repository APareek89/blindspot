import { Hono } from "hono";
import { listBetaFeedback, submitBetaFeedback } from "@blindspot/core";
import { BetaFeedbackInputSchema } from "@blindspot/shared";
import type { Env } from "../types";

export const feedbackRouter = new Hono<Env>();

feedbackRouter.get("/beta-feedback", async (c) => {
  return c.json({ feedback: await listBetaFeedback(c.get("projectId")) });
});

feedbackRouter.post("/beta-feedback", async (c) => {
  const parsed = BetaFeedbackInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: { message: parsed.error.issues[0]?.message ?? "invalid feedback" } },
      400,
    );
  }
  return c.json(
    { feedback: await submitBetaFeedback(c.get("projectId"), parsed.data) },
    201,
  );
});
