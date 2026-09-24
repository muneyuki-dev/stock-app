/**
 * テクニカル指標の計算。
 *
 * このファイルは「純関数」だけで構成する。
 *   - 外部APIやDBを呼ばない
 *   - 引数を書き換えない
 *   - 同じ入力なら必ず同じ出力を返す
 * こうしておくとテストが簡単で、将来 RSI や MACD を追加するときも
 * ここに足すだけで済む。
 */

import type { PriceBar } from "./types.ts";

/** 表示する移動平均の期間 */
export const MA_PERIODS = [5, 25, 75, 200] as const;

/**
 * 移動平均の系列。
 * 期間に達していない先頭部分（助走期間）は null になる。
 * 例: 5日移動平均なら 0〜3 番目は null、4 番目から値が入る。
 */
export type MaSeries = readonly (number | null)[];

/** クロスの種類 */
export type CrossType = "golden" | "dead";

/** 判定するクロスの組み合わせ */
export type CrossPair = "5/25" | "25/75";

/** 検出したクロス1件（純粋な計算結果。日付は持たない） */
export type Cross = {
  readonly type: CrossType;
  /** 何本目のローソク足で交差したか */
  readonly index: number;
};

/** クロス1件に日付などの情報を付けたもの（画面表示用） */
export type CrossSignal = Cross & {
  readonly pair: CrossPair;
  /** クロスが発生した日付 */
  readonly date: string;
  /** 最新のローソク足から見て何本前か（0 なら当日発生） */
  readonly daysAgo: number;
};

/** 移動平均とクロス判定の結果をまとめたもの */
export type IndicatorResult = {
  readonly sma5: MaSeries;
  readonly sma25: MaSeries;
  readonly sma75: MaSeries;
  readonly sma200: MaSeries;
  /** 組み合わせごとの「直近のクロス」。一度も発生していなければ null */
  readonly latest: Readonly<Record<CrossPair, CrossSignal | null>>;
  /** 検出できたすべてのクロス（発生が古い順） */
  readonly history: readonly CrossSignal[];
};

/**
 * 単純移動平均（SMA: Simple Moving Average）を計算する。
 *
 * @param values 終値などの数値の並び（古い順）
 * @param period 平均する日数
 * @returns values と同じ長さの配列。助走期間は null
 */
export function sma(values: readonly number[], period: number): MaSeries {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`period は1以上の整数で指定してください: ${period}`);
  }

  const result: (number | null)[] = new Array(values.length).fill(null);

  // period 本そろった位置から計算を始める
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += values[j];
    }
    result[i] = sum / period;
  }

  return result;
}

/**
 * 短期線と長期線の交差（ゴールデンクロス・デッドクロス）を検出する。
 *
 * 判定ルール:
 *   ゴールデンクロス … 前日は「短期 <= 長期」で、当日「短期 > 長期」になった
 *   デッドクロス   … 前日は「短期 >= 長期」で、当日「短期 < 長期」になった
 *
 * 前日と当日の両方で2本の線が確定している必要がある。
 * どちらかが助走期間中（null）の区間は判定しない。
 *
 * @param short 短期の移動平均（例: 5日）
 * @param long 長期の移動平均（例: 25日）
 * @returns 検出したクロス（古い順）
 */
export function detectCrosses(short: MaSeries, long: MaSeries): Cross[] {
  const crosses: Cross[] = [];
  const length = Math.min(short.length, long.length);

  for (let i = 1; i < length; i++) {
    const prevShort = short[i - 1];
    const prevLong = long[i - 1];
    const currShort = short[i];
    const currLong = long[i];

    // 助走期間はどちらかが null になるので判定できない
    if (
      prevShort === null ||
      prevLong === null ||
      currShort === null ||
      currLong === null
    ) {
      continue;
    }

    if (prevShort <= prevLong && currShort > currLong) {
      crosses.push({ type: "golden", index: i });
    } else if (prevShort >= prevLong && currShort < currLong) {
      crosses.push({ type: "dead", index: i });
    }
  }

  return crosses;
}

/**
 * 日足データから移動平均（5日・25日・75日）とクロス判定をまとめて求める。
 *
 * 注意: 75日移動平均は 75 本の助走が必要で、さらにクロス判定には
 * その次の足も必要になる。25/75 の判定には最低 76 本の日足が要る。
 *
 * @param bars 日足データ（古い順に並んでいること）
 */
export function analyzeMovingAverages(
  bars: readonly PriceBar[],
): IndicatorResult {
  const closes = bars.map((bar) => bar.close);

  const sma5 = sma(closes, 5);
  const sma25 = sma(closes, 25);
  const sma75 = sma(closes, 75);
  const sma200 = sma(closes, 200);

  const lastIndex = bars.length - 1;

  /** 計算結果のクロスに、日付と「何日前か」を付ける */
  const withDate =
    (pair: CrossPair) =>
    (cross: Cross): CrossSignal => ({
      ...cross,
      pair,
      date: bars[cross.index].date,
      daysAgo: lastIndex - cross.index,
    });

  const shortTerm = detectCrosses(sma5, sma25).map(withDate("5/25"));
  const midTerm = detectCrosses(sma25, sma75).map(withDate("25/75"));

  return {
    sma5,
    sma25,
    sma75,
    sma200,
    latest: {
      "5/25": shortTerm.at(-1) ?? null,
      "25/75": midTerm.at(-1) ?? null,
    },
    history: [...shortTerm, ...midTerm].sort((a, b) => a.index - b.index),
  };
}

/**
 * 「最近ゴールデンクロスした」かどうかを判定する（バッジ表示用）。
 *
 * @param signal 直近のクロス（なければ null）
 * @param withinDays 何日以内を「最近」とみなすか
 */
export function isRecentGoldenCross(
  signal: CrossSignal | null,
  withinDays = 5,
): boolean {
  return (
    signal !== null && signal.type === "golden" && signal.daysAgo <= withinDays
  );
}
