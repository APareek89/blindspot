import { NextRequest, NextResponse } from "next/server";
import { api, ApiError } from "@/lib/api";
import { KEY_COOKIE, KEY_COOKIE_OPTIONS } from "@/lib/auth-cookie";
import { isSameOriginNavigation, publicOrigin } from "@/lib/request-origin";

function safeNext(value: FormDataEntryValue | null): string {
  const path = typeof value === "string" ? value : "/";
  return /^\/(?!\/)[^\\\r\n]*$/.test(path) ? path : "/";
}

function loginError(req: NextRequest, code: string, next: string) {
  const url = new URL("/login", publicOrigin(req));
  url.searchParams.set("error", code);
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url, 303);
}

export async function POST(req: NextRequest) {
  const expectedOrigin = publicOrigin(req);
  if (!isSameOriginNavigation(req)) {
    return NextResponse.json({ error: "cross-origin sign-in is not allowed" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  const contentLength = Number(req.headers.get("content-length"));
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    return NextResponse.json({ error: "unsupported sign-in content type" }, { status: 415 });
  }
  if (!Number.isInteger(contentLength) || contentLength < 1 || contentLength > 4096) {
    return NextResponse.json({ error: "invalid sign-in request size" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "malformed sign-in form" }, { status: 400 });
  }
  const key = String(form.get("key") ?? "").trim();
  const next = safeNext(form.get("next"));
  if (!/^bs_live_[a-fA-F0-9]{48}$/.test(key)) return loginError(req, "shape", next);

  try {
    await api(key).me({ signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return loginError(req, "invalid", next);
    if (error instanceof ApiError && error.status === 0) return loginError(req, "gateway", next);
    return loginError(req, "failed", next);
  }

  const response = NextResponse.redirect(new URL(next, expectedOrigin), 303);
  // Bind the cookie to the redirect response so Render's proxy forwards it on every route.
  response.cookies.set(KEY_COOKIE, key, KEY_COOKIE_OPTIONS);
  return response;
}
