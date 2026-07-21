import { NextRequest, NextResponse } from "next/server";
import { KEY_COOKIE, KEY_COOKIE_OPTIONS } from "@/lib/auth-cookie";
import { callSignupGateway, gatewayError, readInviteRequest } from "@/lib/signup-api";

const KEY_PATTERN = /^bs_live_[a-f0-9]{48}$/;

export async function POST(req: NextRequest) {
  const inviteToken = await readInviteRequest(req);
  if (inviteToken instanceof NextResponse) return inviteToken;

  const upstream = await callSignupGateway("create", inviteToken);
  const recoveryKey = upstream.body.recoveryKey;
  const applicationKey = upstream.body.applicationKey;
  const project = upstream.body.project;
  if (
    upstream.status !== 200 ||
    typeof recoveryKey !== "string" ||
    !KEY_PATTERN.test(recoveryKey) ||
    typeof applicationKey !== "string" ||
    !KEY_PATTERN.test(applicationKey) ||
    !project ||
    typeof project !== "object" ||
    typeof (project as { name?: unknown }).name !== "string" ||
    typeof (project as { userId?: unknown }).userId !== "string"
  ) {
    return NextResponse.json(
      { error: gatewayError(upstream.body, "Workspace creation failed.") },
      { status: upstream.status },
    );
  }

  const response = NextResponse.json(
    {
      project: {
        name: (project as { name: string }).name,
        owner: (project as { userId: string }).userId,
      },
      recoveryKey,
      applicationKey,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(KEY_COOKIE, recoveryKey, KEY_COOKIE_OPTIONS);
  return response;
}
