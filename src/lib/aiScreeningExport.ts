import { SCREEN_CONDITIONS, type ScreenCondition } from "./screener.ts";
import type {
  AllStockScreeningRun,
  SavedScreeningResult,
} from "./screeningPersistence.ts";
import { toYahooSymbol } from "./stockCode.ts";

export const AI_SCREENING_SCHEMA_VERSION = "1.0";

const descriptions: Readonly<Record<ScreenCondition, string>> = {
  near75: "75日移動平均線との乖離率の絶対値が3%以内",
  notExtended75: "75日移動平均線との乖離率が0〜+8%",
  cross75: "直近5営業日以内に終値が75日移動平均線を下から上へ通過",
  risingMas: "25日・75日・200日移動平均線がすべて5営業日前より上",
  volumeSurge: "当日出来高が直前20日平均出来高の1.5倍以上",
  nearYearHigh: "終値が52週高値から5%以内",
  firstPullback:
    "25日/75日ゴールデンクロス後に8%以上上昇し、75日線の0〜5%上へ初めて戻った日から3営業日以内",
};

export const AI_SCREENING_DEFINITION = SCREEN_CONDITIONS.map(
  ({ key, label }) => ({
    id: key,
    name: label,
    description: descriptions[key],
  }),
);

function conditionDetails(conditions: readonly ScreenCondition[]) {
  const selected = new Set(conditions);
  return AI_SCREENING_DEFINITION.filter(({ id }) => selected.has(id));
}

function calendarDaysBehind(primaryDate: string | null, latestDate: string) {
  if (primaryDate === null || latestDate >= primaryDate) return 0;
  const primary = Date.parse(`${primaryDate}T00:00:00Z`);
  const latest = Date.parse(`${latestDate}T00:00:00Z`);
  if (!Number.isFinite(primary) || !Number.isFinite(latest)) return null;
  return Math.round((primary - latest) / 86_400_000);
}

function exportResult(
  result: SavedScreeningResult,
  primaryDate: string | null,
) {
  return {
    code: result.code,
    ticker: toYahooSymbol(result.code),
    name: result.name,
    latestDate: result.latestDate,
    fetchedAt: result.fetchedAt,
    screenedAt: result.screenedAt,
    isStale: primaryDate !== null && result.latestDate < primaryDate,
    daysBehindPrimaryDate: calendarDaysBehind(primaryDate, result.latestDate),
    close: result.close,
    volume: result.volume,
    matchedCount: result.matchCount,
    totalConditions: result.totalConditions,
    matchRate: result.matchRate,
    matchedConditions: conditionDetails(result.matchedConditions),
    unmatchedConditions: conditionDetails(result.unmatchedConditions),
    reasons: result.matchedReasons,
    technicalValues: {
      sma5: null,
      sma25: result.sma25,
      sma75: result.sma75,
      sma200: result.sma200,
      deviationFromSma75Percent: result.distanceFrom75Percent,
      volumeRatio20d: result.volumeRatio,
      high52Week: result.yearHigh,
      low52Week: result.yearLow,
      distanceFrom52WeekHighPercent: result.distanceFromYearHighPercent,
      crossedAboveSma75Date: result.cross75Date,
      firstPullbackDate: result.firstPullbackDate,
    },
  };
}

export function createAiScreeningExport(
  run: AllStockScreeningRun,
  exportedAt = new Date().toISOString(),
) {
  const dateSummary = run.dateSummary;
  const primaryDate = dateSummary?.primaryDate ?? null;
  return {
    metadata: {
      schemaVersion: AI_SCREENING_SCHEMA_VERSION,
      exportedAt,
      screeningStartedAt: run.startedAt,
      screeningCompletedAt: run.completedAt,
      primaryDate,
      primaryDateCount: dateSummary?.primaryDateCount ?? 0,
      staleDateCount: dateSummary?.staleDateCount ?? 0,
      oldestDate: dateSummary?.oldestDate ?? null,
      dateDistribution: dateSummary?.dateDistribution ?? {},
      totalStocks: run.total,
      successfulStocks: run.successful,
      unavailableStocks: run.failed,
      matchedStocks: run.results.length,
      screeningMode: "nOf7",
      minMatchedConditions: run.minimumMatches,
      requiredConditions: conditionDetails(run.requiredConditions),
      sortOrder: "matchedCountDesc",
    },
    screeningDefinition: {
      totalConditions: SCREEN_CONDITIONS.length,
      conditions: AI_SCREENING_DEFINITION,
    },
    results: run.results.map((result) => exportResult(result, primaryDate)),
  };
}

const filenameSlugs: Readonly<Record<ScreenCondition, string>> = {
  near75: "near-sma75",
  notExtended75: "not-extended-sma75",
  cross75: "cross-sma75",
  risingMas: "rising-mas",
  volumeSurge: "volume-surge",
  nearYearHigh: "near-52w-high",
  firstPullback: "first-pullback",
};

export function aiScreeningFilename(run: AllStockScreeningRun): string {
  const date = run.dateSummary?.primaryDate ?? run.startedAt.slice(0, 10);
  const required = run.requiredConditions
    .map((condition) => filenameSlugs[condition])
    .join("-");
  const suffix = required === "" ? "" : `-${required}`;
  return `ai-stock-screening-${date}-${run.minimumMatches}of7${suffix}.json`;
}
