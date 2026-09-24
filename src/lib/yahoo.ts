/**
 * Yahoo Finance から日本株の日足データを取得する。
 *
 * このファイルは「外部との通信」を担当する層で、取得したデータを必ず
 * アプリ共通の Candle 型に変換してから返す。将来 J-Quants に乗り換える
 * ときは、同じ戻り値を返す別ファイルを用意して差し替えるだけで済む。
 *
 * 注意:
 *   - yahoo-finance2 は Yahoo 公式のAPIではない非公式ライブラリ。
 *     仕様変更・項目欠損・アクセス制限が起こる前提で例外処理をする。
 *   - Yahoo の CORS / Cookie の制約でブラウザから直接呼べないため、
 *     必ずサーバー側（Server Component や Route Handler）から呼ぶ。
 */

import YahooFinance from "yahoo-finance2";
import { parseStockCode } from "./stockCode.ts";
import type { Candle, Result } from "./types.ts";

/**
 * v4 ではインスタンスを作って使う（v2 の setGlobalConfig 方式は廃止）。
 * 同時リクエスト数を絞って、非公式APIに負荷をかけないようにする。
 */
const yahooFinance = new YahooFinance({
  queue: { concurrency: 2, interval: 250 },
});

/**
 * 25日/75日のクロス判定に必要な最低本数。
 * 75本目で75日線が確定し、その次の足で初めて交差を比較できる。
 */
export const MIN_BARS_FOR_MID_TERM_CROSS = 76;

/**
 * 既定の取得期間（暦日）。
 *
 * チャートは1年（365暦日、約252営業日）を表示する想定だが、
 * 75日移動平均は表示開始日より前に75営業日分の助走が必要。
 * 営業日は祝日・年末年始（大納会〜大発会）を挟んで暦日の
 * 約69%程度に減るため、75営業日ぶんの助走には約110暦日が必要になる。
 * さらに祝日が連続する時期（GW・年末年始）を吸収する余裕を持たせて、
 * 表示に使う365日 + 助走用の195日 = 560日ぶんを取得する。
 * これにより1年表示でも75日線が左端から欠けない。
 */
const DEFAULT_LOOKBACK_DAYS = 560;

const MS_PER_DAY = 86_400_000;

/**
 * "max"（最大期間）指定時に period1 として渡す日付。
 * どの銘柄の上場日より確実に古い日付であればよく、Yahoo 側が
 * 実際の上場日（firstTradeDate）に自動でクランプしてくれる。
 */
const EARLIEST_POSSIBLE_DATE = new Date("1900-01-01T00:00:00Z");

/** 日足の取得結果 */
export type StockChartData = {
  /** 銘柄コード（例: "7203"） */
  readonly code: string;
  /** Yahoo のシンボル（例: "7203.T"） */
  readonly symbol: string;
  /** 銘柄名。取得できなければ null */
  readonly name: string | null;
  /** 通貨（日本株なら "JPY"） */
  readonly currency: string;
  /** 取得時点の株価（約20分遅延） */
  readonly marketPrice: number;
  /** 上記株価の時刻 */
  readonly marketTime: Date;
  /** 日足（古い順） */
  readonly candles: readonly Candle[];
};

export type FetchDailyCandlesOptions = {
  /**
   * 何暦日ぶん遡って取得するか。
   * "max" を指定すると上場日まで全期間を取得する
   * （チャートの期間選択で「最大」まで切り替えられるようにするため）。
   */
  readonly lookbackDays?: number | "max";
};

/** lookbackDays の指定から、Yahoo に渡す取得開始日（period1）を求める */
export function resolvePeriod1(lookbackDays: number | "max"): Date {
  if (lookbackDays === "max") {
    return EARLIEST_POSSIBLE_DATE;
  }
  return new Date(Date.now() - lookbackDays * MS_PER_DAY);
}

/**
 * yahoo-finance2 の chart() が返す1本ぶんの形。
 * ライブラリの型に直接依存させないことで、この変換処理だけを
 * ネットワークなしでテストできるようにしている。
 */
type ChartQuoteRow = {
  readonly date: Date;
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly close: number | null;
  readonly volume: number | null;
};

/**
 * 日付を「日本時間の YYYY-MM-DD」に変換する。
 *
 * Yahoo は UTC の Date を返すため、toISOString() で日付部分を切り出すと
 * 日本時間とずれることがある（例: 日本時間 9/22 00:00 は UTC では 9/21）。
 * そのため必ず Asia/Tokyo に変換してから日付を組み立てる。
 */
const tokyoDateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toTokyoDateString(date: Date): string {
  const parts = tokyoDateParts.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Yahoo のレスポンスをアプリ共通の Candle 型に変換する。
 *
 * 売買停止日などは値が null で返ってくるため、四本値が欠けている足は
 * 取り除く（移動平均の計算が NaN で汚染されるのを防ぐ）。
 */
export function toCandles(rows: readonly ChartQuoteRow[]): Candle[] {
  const candles: Candle[] = [];

  for (const row of rows) {
    if (
      row.open === null ||
      row.high === null ||
      row.low === null ||
      row.close === null
    ) {
      continue;
    }

    candles.push({
      date: toTokyoDateString(row.date),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      // 出来高だけが欠けている日はありうるので 0 として扱う
      volume: row.volume ?? 0,
    });
  }

  // 念のため日付の昇順（古い順）に整える
  candles.sort((a, b) => a.date.localeCompare(b.date));

  return candles;
}

/**
 * 銘柄コードを指定して日足データを取得する。
 *
 * 例外を投げずに Result 型を返すので、呼び出し側は必ず
 * 成功/失敗を判定してから中身を使うことになる。
 *
 * @param code 銘柄コード（例: "7203"）。内部で "7203.T" に変換する
 */
export async function fetchDailyCandles(
  code: string,
  options: FetchDailyCandlesOptions = {},
): Promise<Result<StockChartData>> {
  const parsed = parseStockCode(code);
  if (!parsed.ok) {
    return parsed;
  }

  const { symbol } = parsed.value;
  const period1 = resolvePeriod1(options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS);

  try {
    const chart = await yahooFinance.chart(symbol, {
      period1,
      interval: "1d",
    });

    const candles = toCandles(chart.quotes);

    if (candles.length === 0) {
      return {
        ok: false,
        error: `${parsed.value.code} の日足データが取得できませんでした。銘柄コードを確認してください。`,
      };
    }

    return {
      ok: true,
      value: {
        code: parsed.value.code,
        symbol,
        name: chart.meta.longName ?? chart.meta.shortName ?? null,
        currency: chart.meta.currency,
        marketPrice: chart.meta.regularMarketPrice,
        marketTime: chart.meta.regularMarketTime,
        candles,
      },
    };
  } catch (error) {
    // 存在しない銘柄コード、通信エラー、Yahoo 側の仕様変更などをまとめて扱う
    const detail = error instanceof Error ? error.message : String(error);

    return {
      ok: false,
      error: `${parsed.value.code} の株価取得に失敗しました: ${detail}`,
    };
  }
}
