import {
  type ScreeningApiResponse,
  screenMovingAverageConditions,
} from "@/lib/screener";
import { parseStockCode } from "@/lib/stockCode";
import { fetchDailyCandles } from "@/lib/yahoo";

const MAX_CODES = 50;
const SCREEN_LOOKBACK_DAYS = 420;

type RequestBody = { readonly codes?: unknown };

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!verifyConfiguredSession(token)) {
    return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json(
      { error: "リクエストの形式が不正です。" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.codes)) {
    return Response.json(
      { error: "銘柄コードを指定してください。" },
      { status: 400 },
    );
  }

  const codes = [
    ...new Set(
      body.codes
        .filter((code): code is string => typeof code === "string")
        .map((code) => code.trim().toUpperCase()),
    ),
  ];

  if (codes.length === 0 || codes.length > MAX_CODES) {
    return Response.json(
      { error: `銘柄コードは1〜${MAX_CODES}件で指定してください。` },
      { status: 400 },
    );
  }

  const invalidCode = codes.find((code) => !parseStockCode(code).ok);
  if (invalidCode !== undefined) {
    return Response.json(
      { error: `銘柄コードの形式が不正です: ${invalidCode}` },
      { status: 400 },
    );
  }

  const settled = await Promise.all(
    codes.map(async (code) => {
      const fetched = await fetchDailyCandles(code, {
        lookbackDays: SCREEN_LOOKBACK_DAYS,
      });
      if (!fetched.ok) {
        return { ok: false as const, code, error: fetched.error };
      }

      const screened = screenMovingAverageConditions(fetched.value.candles);
      if (screened === null) {
        return {
          ok: false as const,
          code,
          error: "200日移動平均線の判定に必要な日足が不足しています。",
        };
      }

      return {
        ok: true as const,
        value: {
          ...screened,
          code: fetched.value.code,
          name: fetched.value.name,
        },
      };
    }),
  );

  const response: ScreeningApiResponse = {
    results: settled.filter((item) => item.ok).map((item) => item.value),
    failures: settled
      .filter((item) => !item.ok)
      .map(({ code, error }) => ({ code, error })),
  };

  return Response.json(response);
}

import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifyConfiguredSession } from "@/lib/auth";
