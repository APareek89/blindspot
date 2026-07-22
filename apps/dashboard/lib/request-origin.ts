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

/**
 * Browser form navigations can carry the opaque `Origin: null` value even when
 * Sec-Fetch-Site proves the user activated a same-origin navigation. This narrow
 * exception is for HTML form actions only; JSON/fetch endpoints stay on the exact
 * origin check above. Cross-site forms cannot set the browser-controlled Fetch
 * Metadata headers to `same-origin`, so they remain rejected.
 */
export function isSameOriginNavigation(req: NextRequest): boolean {
  if (isSameOrigin(req)) return true;
  return (
    req.headers.get("origin") === "null" &&
    req.headers.get("sec-fetch-site") === "same-origin" &&
    req.headers.get("sec-fetch-mode") === "navigate"
  );
}
