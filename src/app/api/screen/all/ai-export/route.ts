import type { NextRequest } from "next/server";
import {
  aiScreeningFilename,
  createAiScreeningExport,
} from "@/lib/aiScreeningExport";
import { getAllStockScreeningRun } from "@/lib/allStockScreening";
import { SESSION_COOKIE_NAME, verifyConfiguredSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  if (
    !verifyConfiguredSession(request.cookies.get(SESSION_COOKIE_NAME)?.value)
  ) {
    return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const run = await getAllStockScreeningRun();
  if (run === null || run.state !== "completed" || run.results.length === 0) {
    return Response.json(
      { error: "出力できる完了済みスクリーニング結果がありません。" },
      { status: 409 },
    );
  }

  return new Response(JSON.stringify(createAiScreeningExport(run), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${aiScreeningFilename(run)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
