import type { NextRequest } from "next/server";
import {
  getAllStockScreeningStatus,
  screeningStatus,
  startAllStockScreening,
} from "@/lib/allStockScreening";
import {
  isSameOriginRequest,
  SESSION_COOKIE_NAME,
  verifyConfiguredSession,
} from "@/lib/auth";
import { SCREEN_CONDITIONS, type ScreenCondition } from "@/lib/screener";

function authenticated(request: NextRequest): boolean {
  return verifyConfiguredSession(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
}

export async function GET(request: NextRequest) {
  if (!authenticated(request))
    return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  return Response.json({ status: await getAllStockScreeningStatus() });
}

export async function POST(request: NextRequest) {
  if (!authenticated(request))
    return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  if (!isSameOriginRequest(request))
    return Response.json({ error: "不正な送信元です。" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as {
    selectedConditions?: unknown;
    matchMode?: unknown;
    reset?: unknown;
    minimumMatches?: unknown;
    requiredConditions?: unknown;
    limit?: unknown;
  };
  const valid = new Set(SCREEN_CONDITIONS.map((condition) => condition.key));
  const selectedConditions = Array.isArray(body.selectedConditions)
    ? body.selectedConditions.filter(
        (value): value is ScreenCondition =>
          typeof value === "string" && valid.has(value as ScreenCondition),
      )
    : SCREEN_CONDITIONS.map((condition) => condition.key);
  const minimumMatches = Number(body.minimumMatches ?? 1);
  if (
    !Number.isInteger(minimumMatches) ||
    minimumMatches < 1 ||
    minimumMatches > 7
  )
    return Response.json(
      { error: "一致条件数は1〜7で指定してください。" },
      { status: 400 },
    );
  const requiredConditions = Array.isArray(body.requiredConditions)
    ? body.requiredConditions.filter(
        (value): value is ScreenCondition =>
          typeof value === "string" && valid.has(value as ScreenCondition),
      )
    : [];
  const limit = body.limit === undefined ? undefined : Number(body.limit);
  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || limit < 1 || limit > 3_700)
  )
    return Response.json(
      { error: "対象件数は1〜3,700で指定してください。" },
      { status: 400 },
    );
  const run = await startAllStockScreening({
    selectedConditions,
    matchMode: body.matchMode === "all" ? "all" : "any",
    minimumMatches,
    requiredConditions,
    limit,
    reset: body.reset === true,
  });
  return Response.json({ status: screeningStatus(run) }, { status: 202 });
}
