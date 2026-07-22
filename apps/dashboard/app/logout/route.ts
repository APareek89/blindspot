import { NextRequest, NextResponse } from "next/server";
import { KEY_COOKIE, KEY_COOKIE_OPTIONS } from "@/lib/auth-cookie";
import { isSameOriginNavigation, publicOrigin } from "@/lib/request-origin";

export async function POST(req: NextRequest) {
  if (!isSameOriginNavigation(req)) {
    return NextResponse.json({ error: "cross-origin sign-out is not allowed" }, { status: 403 });
  }

  const response = NextResponse.redirect(new URL("/login", publicOrigin(req)));
  response.cookies.set(KEY_COOKIE, "", { ...KEY_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
