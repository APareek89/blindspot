import { NextResponse } from "next/server";
import { KEY_COOKIE, KEY_COOKIE_OPTIONS } from "@/lib/auth-cookie";

export async function POST(req: Request) {
  const suppliedOrigin = req.headers.get("origin");
  let sameOrigin = false;
  try {
    sameOrigin = Boolean(suppliedOrigin && new URL(suppliedOrigin).origin === new URL(req.url).origin);
  } catch {
    // A malformed origin is never same-origin.
  }
  if (!sameOrigin) {
    return NextResponse.json({ error: "cross-origin sign-out is not allowed" }, { status: 403 });
  }

  const response = NextResponse.redirect(new URL("/login", req.url));
  response.cookies.set(KEY_COOKIE, "", { ...KEY_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
