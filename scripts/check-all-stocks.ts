import {
  getAllStockScreeningRun,
  startAllStockScreening,
} from "../src/lib/allStockScreening.ts";
import type { ScreenCondition } from "../src/lib/screener.ts";

const limit =
  process.argv[2] === "all" ? undefined : Number(process.argv[2] ?? 10);
const resume = process.argv.includes("--resume");
const matchMode = process.argv.includes("--mode=all") ? "all" : "any";
const minimumArgument = process.argv.find((value) =>
  value.startsWith("--minimum="),
);
const minimumMatches = minimumArgument
  ? Number(minimumArgument.split("=")[1])
  : matchMode === "all"
    ? 7
    : 1;
const requiredArgument = process.argv.find((value) =>
  value.startsWith("--required="),
);
const validConditions = new Set<ScreenCondition>([
  "near75",
  "notExtended75",
  "cross75",
  "risingMas",
  "volumeSurge",
  "nearYearHigh",
  "firstPullback",
] as const);
const requiredConditions = (requiredArgument?.split("=")[1] ?? "")
  .split(",")
  .filter((value): value is ScreenCondition =>
    validConditions.has(value as ScreenCondition),
  );
if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
  throw new Error("件数は1以上の整数、または all を指定してください。");
}
if (
  !Number.isInteger(minimumMatches) ||
  minimumMatches < 1 ||
  minimumMatches > 7
) {
  throw new Error("--minimum は1〜7の整数で指定してください。");
}

const started = Date.now();
await startAllStockScreening({
  limit,
  matchMode,
  minimumMatches,
  requiredConditions,
  reset: !resume,
});
let lastProcessed = -1;
while (true) {
  const run = await getAllStockScreeningRun();
  if (run === null) throw new Error("進捗を取得できませんでした。");
  if (run.processed !== lastProcessed) {
    console.log(
      `処理済み ${run.processed}/${run.total} 一致 ${run.matched} 失敗 ${run.failed}`,
    );
    lastProcessed = run.processed;
  }
  if (run.state === "completed") {
    console.log(
      JSON.stringify(
        {
          ...run,
          items: undefined,
          results: undefined,
          durationMs: Date.now() - started,
        },
        null,
        2,
      ),
    );
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
