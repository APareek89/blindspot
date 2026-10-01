import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  // Only a navigation hint; every server page/action rechecks the durable session.
  if (req.cookies.has('blindspot-session') || req.cookies.has('__Secure-blindspot-session')) return NextResponse.next();

  const login = new URL("/login", req.url);
  login.searchParams.set("next", `${req.nextUrl.pathname}${req.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/",
    "/workflows/:path*",
    "/routes/:path*",
    "/approvals/:path*",
    "/drift/:path*",
    "/golden-sets/:path*",
    "/connect/:path*",
    "/feedback/:path*",
    "/settings/:path*",
    "/monitor/:path*",
  ],
};
