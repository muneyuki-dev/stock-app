import { NextResponse } from "next/server";
import {
  isSameOriginRequest,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth";

export function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "不正な送信元からのリクエストです。" },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(request),
    maxAge: 0,
  });
  return response;
}
