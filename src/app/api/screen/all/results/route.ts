import type { NextRequest } from "next/server";
import { getAllStockScreeningRun } from "@/lib/allStockScreening";
import { SESSION_COOKIE_NAME, verifyConfiguredSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  if (
    !verifyConfiguredSession(request.cookies.get(SESSION_COOKIE_NAME)?.value)
  ) {
    return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const run = await getAllStockScreeningRun();
  return Response.json({
    runId: run?.id ?? null,
    state: run?.state ?? null,
    results: run?.results ?? [],
  });
}
