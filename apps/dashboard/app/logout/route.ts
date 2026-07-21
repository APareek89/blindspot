import { NextResponse } from "next/server";
import { KEY_COOKIE, KEY_COOKIE_OPTIONS } from "@/lib/auth-cookie";

export async function GET(req: Request) {
  const response = NextResponse.redirect(new URL("/login", req.url));
  response.cookies.set(KEY_COOKIE, "", { ...KEY_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
