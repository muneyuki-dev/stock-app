import { analyzeMovingAverages } from "./indicators.ts";
import {
  analyzeTechnicalSnapshot,
  TECHNICAL_RULES,
} from "./technicalAnalysis.ts";
import type { Candle } from "./types.ts";

export const SCREEN_CONDITIONS = [
  { key: "near75", label: "75日線付近" },
  { key: "notExtended75", label: "75日線から離れすぎていない" },
  { key: "cross75", label: "75日線を上抜け" },
  { key: "risingMas", label: "移動平均線が上向き" },
  { key: "volumeSurge", label: "出来高が急増" },
  { key: "nearYearHigh", label: "52週高値に接近" },
  { key: "firstPullback", label: "ゴールデンクロス後の初押し" },
] as const;

export type ScreenCondition = (typeof SCREEN_CONDITIONS)[number]["key"];
export const SIGNAL_GROUPS = {
  near75: "position",
  notExtended75: "position",
  cross75: "trigger",
  risingMas: "trend",
  volumeSurge: "volume",
  nearYearHigh: "breakout",
  firstPullback: "pullback",
} as const satisfies Readonly<Record<ScreenCondition, string>>;
export type SignalGroup = (typeof SIGNAL_GROUPS)[ScreenCondition];
export type ScreeningSort =
  | "matchedCount"
  | "signalGroupCount"
  | "volumeRatio"
  | "turnoverValue"
  | "nearYearHigh"
  | "nearSma75";
export type ScreeningMatchMode = "all" | "any";
export const SCREEN_CONDITION_COUNT = SCREEN_CONDITIONS.length;

export type ScreeningSelection = {
  readonly minimumMatches: number;
  readonly requiredConditions: ReadonlySet<ScreenCondition>;
};

export type ScreeningScore = {
  readonly matchCount: number;
  readonly totalConditions: number;
  readonly matchRate: number;
  readonly matchedConditions: readonly ScreenCondition[];
  readonly unmatchedConditions: readonly ScreenCondition[];
};

export type ScreeningResult = {
  readonly latestDate: string;
  readonly close: number;
  readonly sma25: number;
  readonly sma75: number;
  readonly sma200: number;
  /** 終値が75日線から何%離れているか。プラスなら上、マイナスなら下。 */
  readonly distanceFrom75Percent: number;
  readonly volumeRatio: number | null;
  readonly volume: number;
  readonly averageVolume20: number | null;
  readonly turnoverValue: number | null;
  readonly averageTurnoverValue20d: number | null;
  readonly turnoverRatio20d: number | null;
  readonly distanceFromYearHighPercent: number;
  readonly yearHigh: number;
  readonly yearLow: number;
  readonly conditions: Readonly<Record<ScreenCondition, boolean>>;
  /** 直近の75日線上抜け日。対象期間内になければ null。 */
  readonly cross75Date: string | null;
  readonly firstPullbackDate: string | null;
};

export type StockScreeningResult = ScreeningResult & {
  readonly code: string;
  readonly name: string | null;
};

export type StockScreeningFailure = {
  readonly code: string;
  readonly error: string;
};

export type ScreeningApiResponse = {
  readonly results: readonly StockScreeningResult[];
  readonly failures: readonly StockScreeningFailure[];
};

export type ScreeningOptions = {
  /** 75日線付近とみなす乖離率。既定は上下3%。 */
  readonly near75Percent?: number;
  /** 上抜けを探す直近営業日数。既定は5営業日。 */
  readonly crossLookbackSessions?: number;
  /** 移動平均の向きを比較する営業日数。既定は5営業日前との比較。 */
  readonly slopeSessions?: number;
};

export function matchesScreenConditions(
  result: Pick<ScreeningResult, "conditions">,
  selected: ReadonlySet<ScreenCondition>,
  mode: ScreeningMatchMode,
): boolean {
  if (selected.size === 0) return false;
  const values = [...selected].map(
    (condition) => result.conditions[condition] === true,
  );
  return mode === "all" ? values.every(Boolean) : values.some(Boolean);
}

export function scoreScreeningConditions(
  result: Pick<ScreeningResult, "conditions">,
): ScreeningScore {
  const matchedConditions = SCREEN_CONDITIONS.filter(
    ({ key }) => result.conditions[key] === true,
  ).map(({ key }) => key);
  const unmatchedConditions = SCREEN_CONDITIONS.filter(
    ({ key }) => result.conditions[key] !== true,
  ).map(({ key }) => key);
  return {
    matchCount: matchedConditions.length,
    totalConditions: SCREEN_CONDITION_COUNT,
    matchRate: matchedConditions.length / SCREEN_CONDITION_COUNT,
    matchedConditions,
    unmatchedConditions,
  };
}

export function matchesScreeningSelection(
  result: Pick<ScreeningResult, "conditions">,
  selection: ScreeningSelection,
): boolean {
  const minimumMatches = Math.min(
    SCREEN_CONDITION_COUNT,
    Math.max(1, Math.trunc(selection.minimumMatches)),
  );
  const score = scoreScreeningConditions(result);
  return (
    score.matchCount >= minimumMatches &&
    [...selection.requiredConditions].every(
      (condition) => result.conditions[condition] === true,
    )
  );
}

export function rankScreeningResults<
  T extends Pick<ScreeningResult, "conditions">,
>(results: readonly T[]): T[] {
  return results
    .map((result, index) => ({ result, index }))
    .sort(
      (left, right) =>
        scoreScreeningConditions(right.result).matchCount -
          scoreScreeningConditions(left.result).matchCount ||
        left.index - right.index,
    )
    .map(({ result }) => result);
}

export function matchedSignalGroups(
  result: Pick<ScreeningResult, "conditions">,
): readonly SignalGroup[] {
  return [
    ...new Set(
      SCREEN_CONDITIONS.filter(
        ({ key }) => result.conditions[key] === true,
      ).map(({ key }) => SIGNAL_GROUPS[key]),
    ),
  ];
}

export function passesLiquidityFilter(
  result: Pick<ScreeningResult, "averageTurnoverValue20d">,
  minimumAverageTurnover20d: number | null,
): boolean {
  return (
    minimumAverageTurnover20d === null ||
    minimumAverageTurnover20d <= 0 ||
    (result.averageTurnoverValue20d !== null &&
      result.averageTurnoverValue20d >= minimumAverageTurnover20d)
  );
}

export function sortScreeningResults<T extends ScreeningResult>(
  results: readonly T[],
  sort: ScreeningSort,
): T[] {
  const value = (result: T): number => {
    if (sort === "matchedCount")
      return scoreScreeningConditions(result).matchCount;
    if (sort === "signalGroupCount") return matchedSignalGroups(result).length;
    if (sort === "volumeRatio")
      return result.volumeRatio ?? Number.NEGATIVE_INFINITY;
    if (sort === "turnoverValue")
      return result.turnoverValue ?? Number.NEGATIVE_INFINITY;
    if (sort === "nearYearHigh") return result.distanceFromYearHighPercent;
    return -Math.abs(result.distanceFrom75Percent);
  };
  return results
    .map((result, index) => ({ result, index }))
    .sort(
      (left, right) =>
        value(right.result) - value(left.result) || left.index - right.index,
    )
    .map(({ result }) => result);
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function screeningMatchReasons(
  result: ScreeningResult,
  selected: ReadonlySet<ScreenCondition>,
): readonly string[] {
  const reasons: Partial<Record<ScreenCondition, string>> = {
    near75: `75日線乖離 ${signed(result.distanceFrom75Percent)}（基準 ±3%）`,
    notExtended75: `75日線乖離 ${signed(result.distanceFrom75Percent)}（基準 0〜+8%）`,
    cross75: `75日線上抜け ${result.cross75Date ?? "—"}（直近5営業日）`,
    risingMas: `25・75・200日線が5営業日前より上昇（現在 ${result.sma25.toFixed(1)} / ${result.sma75.toFixed(1)} / ${result.sma200.toFixed(1)}）`,
    volumeSurge: `出来高20日平均比 ${result.volumeRatio?.toFixed(2) ?? "—"}倍（基準 1.5倍以上）`,
    nearYearHigh: `52週高値まで ${signed(result.distanceFromYearHighPercent)}（基準 -5%以内）`,
    firstPullback: `初押し接近日 ${result.firstPullbackDate ?? "—"}（75日線の0〜5%、直近3営業日）`,
  };
  return SCREEN_CONDITIONS.filter(
    ({ key }) => selected.has(key) && result.conditions[key] === true,
  ).map(({ key }) => reasons[key] ?? key);
}

/**
 * 日足から書籍のチェック項目に近い3条件を判定する純関数。
 * 200日線と傾き判定に必要なデータが足りない場合は null を返す。
 */
export function screenMovingAverageConditions(
  bars: readonly Candle[],
  options: ScreeningOptions = {},
): ScreeningResult | null {
  const near75Percent = options.near75Percent ?? 3;
  const crossLookbackSessions = options.crossLookbackSessions ?? 5;
  const slopeSessions = options.slopeSessions ?? 5;
  const indicators = analyzeMovingAverages(bars);
  const technical = analyzeTechnicalSnapshot(bars);
  const latestIndex = bars.length - 1;
  const comparisonIndex = latestIndex - slopeSessions;

  if (latestIndex < 0 || comparisonIndex < 0 || technical === null) {
    return null;
  }

  const sma25 = indicators.sma25[latestIndex];
  const sma75 = indicators.sma75[latestIndex];
  const sma200 = indicators.sma200[latestIndex];
  const previousSma25 = indicators.sma25[comparisonIndex];
  const previousSma75 = indicators.sma75[comparisonIndex];
  const previousSma200 = indicators.sma200[comparisonIndex];

  if (
    sma25 === null ||
    sma75 === null ||
    sma200 === null ||
    previousSma25 === null ||
    previousSma75 === null ||
    previousSma200 === null
  ) {
    return null;
  }

  const close = bars[latestIndex].close;
  const distanceFrom75Percent = ((close - sma75) / sma75) * 100;

  let cross75Date: string | null = null;
  const firstCrossIndex = Math.max(1, bars.length - crossLookbackSessions);
  for (let i = latestIndex; i >= firstCrossIndex; i--) {
    const previous75 = indicators.sma75[i - 1];
    const current75 = indicators.sma75[i];
    if (
      previous75 !== null &&
      current75 !== null &&
      bars[i - 1].close <= previous75 &&
      bars[i].close > current75
    ) {
      cross75Date = bars[i].date;
      break;
    }
  }

  return {
    latestDate: bars[latestIndex].date,
    close,
    sma25,
    sma75,
    sma200,
    distanceFrom75Percent,
    volume: bars[latestIndex].volume,
    averageVolume20: technical.averageVolume20,
    volumeRatio: technical.volumeRatio,
    turnoverValue: technical.turnoverValue,
    averageTurnoverValue20d: technical.averageTurnoverValue20d,
    turnoverRatio20d: technical.turnoverRatio20d,
    distanceFromYearHighPercent: technical.distanceFromYearHighPercent,
    yearHigh: technical.yearHigh,
    yearLow: technical.yearLow,
    conditions: {
      near75: Math.abs(distanceFrom75Percent) <= near75Percent,
      notExtended75:
        distanceFrom75Percent >= 0 &&
        distanceFrom75Percent <= TECHNICAL_RULES.notExtended75Percent,
      cross75: cross75Date !== null,
      risingMas:
        sma25 > previousSma25 &&
        sma75 > previousSma75 &&
        sma200 > previousSma200,
      volumeSurge:
        technical.volumeRatio !== null &&
        technical.volumeRatio >= TECHNICAL_RULES.volumeSurgeRatio,
      nearYearHigh:
        technical.distanceFromYearHighPercent >=
        -TECHNICAL_RULES.nearYearHighPercent,
      firstPullback: technical.firstPullback.matched,
    },
    cross75Date,
    firstPullbackDate: technical.firstPullback.firstTouchDate,
  };
}
