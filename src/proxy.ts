import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  safeReturnPath,
  verifyConfiguredSession,
} from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authenticated = verifyConfiguredSession(token);

  if (pathname === "/login" && authenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (authenticated) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "ログインが必要です。" },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("returnTo", safeReturnPath(`${pathname}${search}`));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
