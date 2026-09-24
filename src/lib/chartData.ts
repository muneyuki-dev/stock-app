/**
 * チャート表示用にデータを組み立てる純関数。
 *
 * 移動平均は「取得した全期間」で計算し、そのあとで
 * 「表示する期間（既定1年）」に絞り込む。この順序が重要で、
 * 先に絞り込んでから計算すると75日線の左端が助走不足で
 * null になってしまう。
 */

import {
  analyzeMovingAverages,
  type IndicatorResult,
  type MaSeries,
} from "./indicators.ts";
import type { Candle } from "./types.ts";

/** チャートに表示する既定の期間（暦日） */
export const DISPLAY_DAYS = 365;

/**
 * チャートの表示期間の選択肢。
 * days が null の "max" は「取得できた全期間を表示する」という意味。
 */
export const PERIOD_OPTIONS = [
  { key: "3m", label: "3か月", days: 90 },
  { key: "6m", label: "6か月", days: 180 },
  { key: "1y", label: "1年", days: 365 },
  { key: "3y", label: "3年", days: 365 * 3 },
  { key: "5y", label: "5年", days: 365 * 5 },
  { key: "10y", label: "10年", days: 365 * 10 },
  { key: "max", label: "最大", days: null },
] as const satisfies readonly {
  key: string;
  label: string;
  days: number | null;
}[];

export type PeriodKey = (typeof PERIOD_OPTIONS)[number]["key"];

/** 初期表示に使う期間 */
export const DEFAULT_PERIOD_KEY: PeriodKey = "1y";

/** 期間キーから、buildChartViewModel に渡す表示日数（暦日）を求める */
export function periodToDays(key: PeriodKey): number | null {
  const option = PERIOD_OPTIONS.find((candidate) => candidate.key === key);
  // PERIOD_OPTIONS の全キーが PeriodKey の定義元なので、見つからない状態は
  // 型としてはあり得ない。実行時の想定外入力に備えて既定値を返す。
  return option?.days ?? null;
}

/** 画面に渡す最終的なデータ */
export type ChartViewModel = {
  /** 表示期間に絞り込んだ日足 */
  readonly candles: readonly Candle[];
  /** 表示期間に絞り込んだ5日移動平均（candles と同じ長さ・同じ添字） */
  readonly sma5: MaSeries;
  /** 表示期間に絞り込んだ25日移動平均 */
  readonly sma25: MaSeries;
  /** 表示期間に絞り込んだ75日移動平均 */
  readonly sma75: MaSeries;
  /** 表示期間に絞り込んだ200日移動平均 */
  readonly sma200: MaSeries;
  /** 直近のクロス（取得した全期間から判定。表示期間より古い場合もある） */
  readonly latest: IndicatorResult["latest"];
  /** クロスの発生履歴（取得した全期間） */
  readonly history: IndicatorResult["history"];
};

/** 日付文字列（YYYY-MM-DD）から指定日数だけ前の日付文字列を求める */
function subtractDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * 全期間の日足・指標から、表示に使う期間だけを切り出す。
 *
 * @param candles 取得した全期間の日足（古い順）
 * @param displayDays 表示する期間（暦日）。null なら全期間をそのまま表示する（「最大」用）
 */
export function buildChartViewModel(
  candles: readonly Candle[],
  displayDays: number | null = DISPLAY_DAYS,
): ChartViewModel {
  const indicators = analyzeMovingAverages(candles);

  if (candles.length === 0) {
    return {
      candles: [],
      sma5: [],
      sma25: [],
      sma75: [],
      sma200: [],
      latest: indicators.latest,
      history: indicators.history,
    };
  }

  const from = ((): number => {
    if (displayDays === null) {
      return 0;
    }

    const lastDate = candles[candles.length - 1].date;
    const cutoff = subtractDays(lastDate, displayDays);

    // 日付は "YYYY-MM-DD" なので文字列の比較がそのまま日付の前後比較になる
    const startIndex = candles.findIndex((candle) => candle.date >= cutoff);
    return startIndex === -1 ? 0 : startIndex;
  })();

  return {
    candles: candles.slice(from),
    sma5: indicators.sma5.slice(from),
    sma25: indicators.sma25.slice(from),
    sma75: indicators.sma75.slice(from),
    sma200: indicators.sma200.slice(from),
    latest: indicators.latest,
    history: indicators.history,
  };
}
