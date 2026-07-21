import { NextRequest, NextResponse } from "next/server";
import { callSignupGateway, gatewayError, readInviteRequest } from "@/lib/signup-api";

export async function POST(req: NextRequest) {
  const inviteToken = await readInviteRequest(req);
  if (inviteToken instanceof NextResponse) return inviteToken;

  const upstream = await callSignupGateway("preview", inviteToken);
  const invite = upstream.body.invite;
  if (
    upstream.status !== 200 ||
    !invite ||
    typeof invite !== "object" ||
    typeof (invite as { owner?: unknown }).owner !== "string" ||
    typeof (invite as { project?: unknown }).project !== "string" ||
    typeof (invite as { expiresAt?: unknown }).expiresAt !== "string"
  ) {
    return NextResponse.json(
      { error: gatewayError(upstream.body, "This invitation could not be verified.") },
      { status: upstream.status },
    );
  }

  return NextResponse.json(
    {
      invite: {
        owner: (invite as { owner: string }).owner,
        project: (invite as { project: string }).project,
        expiresAt: (invite as { expiresAt: string }).expiresAt,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
