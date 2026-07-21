import { NextRequest, NextResponse } from "next/server";
import { GATEWAY_URL } from "./api";
import { isSameOrigin } from "./request-origin";

export async function readInviteRequest(req: NextRequest): Promise<string | NextResponse> {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "cross-origin signup is not allowed" }, { status: 403 });
  }
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) {
    return NextResponse.json({ error: "unsupported signup content type" }, { status: 415 });
  }
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 4096) {
    return NextResponse.json({ error: "signup request is too large" }, { status: 413 });
  }
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "malformed signup request" }, { status: 400 });
  }
  if (raw.length > 4096) {
    return NextResponse.json({ error: "signup request is too large" }, { status: 413 });
  }
  try {
    const input = JSON.parse(raw) as { inviteToken?: unknown };
    if (typeof input.inviteToken !== "string" || input.inviteToken.length < 40 || input.inviteToken.length > 2048) {
      throw new Error("invalid token");
    }
    return input.inviteToken;
  } catch {
    return NextResponse.json({ error: "invalid signup request" }, { status: 400 });
  }
}

export async function callSignupGateway(path: "preview" | "create", inviteToken: string) {
  try {
    const response = await fetch(
      `${GATEWAY_URL}/public/v1/signup${path === "preview" ? "/preview" : ""}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteToken }),
        cache: "no-store",
        signal: AbortSignal.timeout(path === "create" ? 45_000 : 20_000),
      },
    );
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: response.status, body };
  } catch {
    return {
      status: 503,
      body: { error: { message: "Blindspot is waking up. Wait a few seconds and retry." } },
    };
  }
}

export function gatewayError(body: Record<string, unknown>, fallback: string): string {
  const error = body.error;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}
