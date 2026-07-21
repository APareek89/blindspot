import { NextRequest } from "next/server";

export function publicOrigin(req: NextRequest): string {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))
    ?.split(",")[0]
    ?.trim();
  const protocol = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.slice(0, -1))
    .split(",")[0]
    ?.trim();
  if (host && (protocol === "http" || protocol === "https")) {
    try {
      return new URL(`${protocol}://${host}`).origin;
    } catch {
      // Fall through to Next's parsed request origin when proxy headers are malformed.
    }
  }
  return req.nextUrl.origin;
}

export function isSameOrigin(req: NextRequest): boolean {
  const suppliedOrigin = req.headers.get("origin");
  try {
    return Boolean(suppliedOrigin && new URL(suppliedOrigin).origin === publicOrigin(req));
  } catch {
    return false;
  }
}
