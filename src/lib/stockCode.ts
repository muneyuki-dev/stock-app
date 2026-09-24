/**
 * 銘柄コードの正規化とバリデーション。
 *
 * Yahoo Finance は日本株（東証）を「7203.T」という形式で扱うため、
 * 画面で入力された「7203」をここで「7203.T」へ変換する。
 * 変換ルールを1か所にまとめておくことで、他のデータソースに差し替える
 * ときの修正箇所がこのファイルだけで済む。
 */

import type { Result } from "./types.ts";

/** 東証の銘柄コードは4桁。2024年以降は英字を含むコード（例: 130A）もある */
const STOCK_CODE_PATTERN = /^[0-9][0-9A-Z]{3}$/;

export type ParsedStockCode = {
  /** 正規化された銘柄コード（例: "7203"） */
  code: string;
  /** Yahoo Finance に渡すシンボル（例: "7203.T"） */
  symbol: string;
};

export type ParseStockCodeResult = Result<ParsedStockCode>;

/** 全角の英数字・記号を半角に直す（「７２０３」と入力されても受け付けるため） */
function toHalfWidth(value: string): string {
  return value.replace(/[！-～]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0),
  );
}

/** 銘柄コードを Yahoo Finance のシンボル形式に変換する */
export function toYahooSymbol(code: string): string {
  return `${code}.T`;
}

/**
 * ユーザー入力を検証して、正規化済みのコードとシンボルを返す。
 * 例外を投げずに結果オブジェクトを返すので、呼び出し側で
 * エラーメッセージをそのまま画面に出せる。
 */
export function parseStockCode(input: string): ParseStockCodeResult {
  // 末尾の .T を取り除くことで「7203.T」と入力された場合も受け付ける
  const code = toHalfWidth(input).trim().toUpperCase().replace(/\.T$/, "");

  if (code === "") {
    return { ok: false, error: "銘柄コードを入力してください。" };
  }

  if (!STOCK_CODE_PATTERN.test(code)) {
    return {
      ok: false,
      error: "銘柄コードは4桁で入力してください（例: 7203）。",
    };
  }

  return { ok: true, value: { code, symbol: toYahooSymbol(code) } };
}
