import { analyzeMovingAverages, type MaSeries } from "./indicators.ts";
import type { Candle } from "./types.ts";

export type Timeframe = "daily" | "weekly";
export type TrendDirection = "rising" | "flat" | "falling";
export type MaAlignment = "bullish" | "bearish" | "mixed";
export type TechnicalStatus = "pullback" | "overheated" | "uptrend" | "watch";

export const TECHNICAL_RULES = {
  slopeSessions: 5,
  flatSlopePercent: 0.1,
  volumeAverageSessions: 20,
  volumeSurgeRatio: 1.5,
  yearSessions: 252,
  nearYearHighPercent: 5,
  near75Percent: 3,
  notExtended75Percent: 8,
  pullbackCrossLookbackSessions: 60,
  pullbackExtensionPercent: 8,
  pullbackBandPercent: 5,
  pullbackActiveSessions: 3,
  pivotWindow: 3,
  levelTolerancePercent: 2,
  minimumLevelTouches: 2,
} as const;

export type PriceLevel = {
  readonly price: number;
  readonly touches: number;
  readonly latestDate: string;
};

export type FirstPullback = {
  readonly matched: boolean;
  readonly goldenCrossDate: string | null;
  readonly firstTouchDate: string | null;
};

export type TechnicalSnapshot = {
  readonly latestDate: string;
  readonly close: number;
  readonly sma25: number;
  readonly sma75: number;
  readonly sma200: number;
  readonly maDirections: Readonly<Record<"25" | "75" | "200", TrendDirection>>;
  readonly maAlignment: MaAlignment;
  readonly distanceFrom75Percent: number;
  readonly averageVolume20: number | null;
  readonly volumeRatio: number | null;
  readonly yearHigh: number;
  readonly yearLow: number;
  /** 52週高値を0として、現在値が何%下にあるか（通常は0以下）。 */
  readonly distanceFromYearHighPercent: number;
  /** 52週安値を0として、現在値が何%上にあるか（通常は0以上）。 */
  readonly distanceFromYearLowPercent: number;
  readonly firstPullback: FirstPullback;
  readonly supports: readonly PriceLevel[];
  readonly resistances: readonly PriceLevel[];
  readonly status: TechnicalStatus;
  readonly statusReasons: readonly string[];
  readonly dataNotes: readonly string[];
};

export type TechnicalAnalysisOptions = {
  /** 52週高値・安値と価格帯候補に使う本数。日足は252、週足は52。 */
  readonly yearSessions?: number;
};

/** 日足を週足にまとめる。日付はその週の最後の取引日を使う。 */
export function aggregateWeeklyCandles(
  candles: readonly Candle[],
): readonly Candle[] {
  const weeks = new Map<string, Candle[]>();

  for (const candle of candles) {
    const date = new Date(`${candle.date}T00:00:00Z`);
    const day = date.getUTCDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    date.setUTCDate(date.getUTCDate() - daysFromMonday);
    const key = date.toISOString().slice(0, 10);
    const group = weeks.get(key);
    if (group) group.push(candle);
    else weeks.set(key, [candle]);
  }

  return [...weeks.values()].map((week) => {
    const first = week[0];
    const last = week[week.length - 1];
    return {
      date: last.date,
      open: first.open,
      high: Math.max(...week.map((candle) => candle.high)),
      low: Math.min(...week.map((candle) => candle.low)),
      close: last.close,
      volume: week.reduce((sum, candle) => sum + candle.volume, 0),
    };
  });
}

function directionAt(
  series: MaSeries,
  latestIndex: number,
  sessions: number,
): TrendDirection | null {
  const current = series[latestIndex];
  const previous = series[latestIndex - sessions];
  if (current === null || previous === null || previous === undefined)
    return null;

  const changePercent = ((current - previous) / previous) * 100;
  if (Math.abs(changePercent) <= TECHNICAL_RULES.flatSlopePercent)
    return "flat";
  return changePercent > 0 ? "rising" : "falling";
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function detectFirstPullback(
  candles: readonly Candle[],
  sma75: MaSeries,
): FirstPullback {
  const history = analyzeMovingAverages(candles).history.filter(
    (signal) => signal.pair === "25/75",
  );
  const latestIndex = candles.length - 1;
  const golden = [...history]
    .reverse()
    .find(
      (signal) =>
        signal.type === "golden" &&
        latestIndex - signal.index <=
          TECHNICAL_RULES.pullbackCrossLookbackSessions,
    );

  if (!golden || latestIndex - golden.index < 2) {
    return {
      matched: false,
      goldenCrossDate: golden?.date ?? null,
      firstTouchDate: null,
    };
  }

  const deadAfterGolden = history.some(
    (signal) => signal.type === "dead" && signal.index > golden.index,
  );
  if (deadAfterGolden) {
    return {
      matched: false,
      goldenCrossDate: golden.date,
      firstTouchDate: null,
    };
  }

  let extendedIndex = -1;
  for (let i = golden.index; i <= latestIndex; i++) {
    const line = sma75[i];
    if (line === null) continue;
    const distance = ((candles[i].close - line) / line) * 100;
    if (distance >= TECHNICAL_RULES.pullbackExtensionPercent) {
      extendedIndex = i;
      break;
    }
  }

  if (extendedIndex === -1) {
    return {
      matched: false,
      goldenCrossDate: golden.date,
      firstTouchDate: null,
    };
  }

  let firstTouchIndex = -1;
  for (let i = extendedIndex + 1; i <= latestIndex; i++) {
    const line = sma75[i];
    if (line === null) continue;
    const distance = ((candles[i].close - line) / line) * 100;
    if (distance >= 0 && distance <= TECHNICAL_RULES.pullbackBandPercent) {
      firstTouchIndex = i;
      break;
    }
  }

  return {
    matched:
      firstTouchIndex !== -1 &&
      latestIndex - firstTouchIndex < TECHNICAL_RULES.pullbackActiveSessions,
    goldenCrossDate: golden.date,
    firstTouchDate:
      firstTouchIndex === -1 ? null : candles[firstTouchIndex].date,
  };
}

type MutableLevel = { price: number; touches: number; latestDate: string };

function clusterLevels(
  pivots: readonly { price: number; date: string }[],
): PriceLevel[] {
  const levels: MutableLevel[] = [];

  for (const pivot of pivots) {
    const level = levels.find(
      (candidate) =>
        Math.abs(pivot.price - candidate.price) / candidate.price <=
        TECHNICAL_RULES.levelTolerancePercent / 100,
    );
    if (level) {
      level.price =
        (level.price * level.touches + pivot.price) / (level.touches + 1);
      level.touches += 1;
      level.latestDate = pivot.date;
    } else {
      levels.push({ price: pivot.price, touches: 1, latestDate: pivot.date });
    }
  }

  return levels.filter(
    (level) => level.touches >= TECHNICAL_RULES.minimumLevelTouches,
  );
}

export function findSupportResistance(
  candles: readonly Candle[],
  lookbackSessions: number = TECHNICAL_RULES.yearSessions,
): { supports: readonly PriceLevel[]; resistances: readonly PriceLevel[] } {
  const recent = candles.slice(-lookbackSessions);
  const window = TECHNICAL_RULES.pivotWindow;
  const lows: { price: number; date: string }[] = [];
  const highs: { price: number; date: string }[] = [];

  for (let i = window; i < recent.length - window; i++) {
    const around = recent.slice(i - window, i + window + 1);
    if (recent[i].low === Math.min(...around.map((candle) => candle.low))) {
      lows.push({ price: recent[i].low, date: recent[i].date });
    }
    if (recent[i].high === Math.max(...around.map((candle) => candle.high))) {
      highs.push({ price: recent[i].high, date: recent[i].date });
    }
  }

  const close = recent.at(-1)?.close;
  if (close === undefined) return { supports: [], resistances: [] };

  const rank = (a: PriceLevel, b: PriceLevel) => {
    const distance = Math.abs(a.price - close) - Math.abs(b.price - close);
    return distance === 0 ? b.touches - a.touches : distance;
  };

  return {
    supports: clusterLevels(lows)
      .filter((level) => level.price <= close * 1.02)
      .sort(rank)
      .slice(0, 3),
    resistances: clusterLevels(highs)
      .filter((level) => level.price >= close * 0.98)
      .sort(rank)
      .slice(0, 3),
  };
}

/** 価格と出来高だけから、説明可能なテクニカル診断を作る純関数。 */
export function analyzeTechnicalSnapshot(
  candles: readonly Candle[],
  options: TechnicalAnalysisOptions = {},
): TechnicalSnapshot | null {
  const latestIndex = candles.length - 1;
  if (latestIndex < 199) return null;

  const indicators = analyzeMovingAverages(candles);
  const sma25 = indicators.sma25[latestIndex];
  const sma75 = indicators.sma75[latestIndex];
  const sma200 = indicators.sma200[latestIndex];
  const direction25 = directionAt(
    indicators.sma25,
    latestIndex,
    TECHNICAL_RULES.slopeSessions,
  );
  const direction75 = directionAt(
    indicators.sma75,
    latestIndex,
    TECHNICAL_RULES.slopeSessions,
  );
  const direction200 = directionAt(
    indicators.sma200,
    latestIndex,
    TECHNICAL_RULES.slopeSessions,
  );

  if (
    sma25 === null ||
    sma75 === null ||
    sma200 === null ||
    direction25 === null ||
    direction75 === null ||
    direction200 === null
  ) {
    return null;
  }

  const latest = candles[latestIndex];
  const maAlignment: MaAlignment =
    latest.close > sma25 && sma25 > sma75 && sma75 > sma200
      ? "bullish"
      : latest.close < sma25 && sma25 < sma75 && sma75 < sma200
        ? "bearish"
        : "mixed";
  const distanceFrom75Percent = ((latest.close - sma75) / sma75) * 100;

  const previousVolumes = candles
    .slice(-(TECHNICAL_RULES.volumeAverageSessions + 1), -1)
    .map((candle) => candle.volume)
    .filter((volume) => volume > 0);
  const averageVolume20 =
    previousVolumes.length === TECHNICAL_RULES.volumeAverageSessions
      ? average(previousVolumes)
      : null;
  const volumeRatio =
    averageVolume20 === null || latest.volume <= 0
      ? null
      : latest.volume / averageVolume20;

  const yearSessions = options.yearSessions ?? TECHNICAL_RULES.yearSessions;
  const yearCandles = candles.slice(-yearSessions);
  const yearHigh = Math.max(...yearCandles.map((candle) => candle.high));
  const yearLow = Math.min(...yearCandles.map((candle) => candle.low));
  const distanceFromYearHighPercent =
    ((latest.close - yearHigh) / yearHigh) * 100;
  const distanceFromYearLowPercent = ((latest.close - yearLow) / yearLow) * 100;
  const firstPullback = detectFirstPullback(candles, indicators.sma75);
  const { supports, resistances } = findSupportResistance(
    candles,
    yearSessions,
  );

  let status: TechnicalStatus = "watch";
  let statusReasons: string[] = [
    "強い方向がそろっていないため、次の変化を待つ状態です。",
  ];
  if (firstPullback.matched) {
    status = "pullback";
    statusReasons = [
      "25日線と75日線のゴールデンクロス後、上昇を挟んで75日線付近へ初めて戻っています。",
    ];
  } else if (distanceFrom75Percent > TECHNICAL_RULES.notExtended75Percent) {
    status = "overheated";
    statusReasons = [
      `終値が75日線より${distanceFrom75Percent.toFixed(1)}%上にあり、追いかけ買いには注意が必要な距離です。`,
    ];
  } else if (
    maAlignment === "bullish" &&
    [direction25, direction75, direction200].every(
      (direction) => direction === "rising",
    )
  ) {
    status = "uptrend";
    statusReasons = [
      "株価・25日線・75日線・200日線が上から順に並び、3本の移動平均線も上向きです。",
    ];
  }

  const dataNotes: string[] = [];
  if (candles.length < yearSessions) {
    dataNotes.push(
      `52週の高値・安値は、取得できた${candles.length}本の範囲で計算しています。`,
    );
  }
  if (supports.length === 0 || resistances.length === 0) {
    dataNotes.push(
      "同じ価格帯への反応が2回未満のため、支持線または抵抗線の候補を十分に出せませんでした。",
    );
  }
  if (volumeRatio === null) {
    dataNotes.push(
      "出来高が欠けているため、20本平均との比較は判定できません。",
    );
  }

  return {
    latestDate: latest.date,
    close: latest.close,
    sma25,
    sma75,
    sma200,
    maDirections: { "25": direction25, "75": direction75, "200": direction200 },
    maAlignment,
    distanceFrom75Percent,
    averageVolume20,
    volumeRatio,
    yearHigh,
    yearLow,
    distanceFromYearHighPercent,
    distanceFromYearLowPercent,
    firstPullback,
    supports,
    resistances,
    status,
    statusReasons,
    dataNotes,
  };
}
