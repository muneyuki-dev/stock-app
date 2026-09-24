/**
 * アプリ全体で共有するドメイン型。
 * どのデータソース（Yahoo Finance / 将来の J-Quants など）を使う場合でも
 * この形に変換してから中の処理に渡す。
 */

/**
 * 処理の成否を表す共通の型。
 * 例外を投げる代わりにこれを返すことで、呼び出し側が
 * エラーメッセージをそのまま画面に出せる。
 */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/** 移動平均の計算に最低限必要な情報（日付と終値） */
export type PriceBar = {
  /** YYYY-MM-DD 形式の日付 */
  readonly date: string;
  /** 終値 */
  readonly close: number;
};

/** 日足1本分。ローソク足の描画に使う */
export type Candle = PriceBar & {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly volume: number;
};
