import { NextRequest, NextResponse } from "next/server";
import { KEY_COOKIE } from "@/lib/auth-cookie";

export function middleware(req: NextRequest) {
  if (req.cookies.has(KEY_COOKIE)) return NextResponse.next();

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
  ],
};
