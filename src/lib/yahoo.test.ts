/**
 * Yahoo Finance から取得したデータの変換処理のテスト。
 * ネットワーク通信をしない純関数だけを対象にしている。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolvePeriod1,
  stockFetchErrorMessage,
  toCandles,
  toTokyoDateString,
} from "./yahoo.ts";

describe("toTokyoDateString（日本時間の日付に変換）", () => {
  it("UTCの日付ではなく日本時間の日付を返す", () => {
    // UTC 9/21 15:00 = 日本時間 9/22 00:00
    // toISOString() だと "2026-09-21" になってしまうケース
    assert.equal(
      toTokyoDateString(new Date("2026-09-21T15:00:00Z")),
      "2026-09-22",
    );
  });

  it("東証の寄り付き（日本時間 9:00）を正しく扱う", () => {
    // UTC 0:00 = 日本時間 9:00。日足はこの時刻で返ってくることが多い
    assert.equal(
      toTokyoDateString(new Date("2026-09-22T00:00:00Z")),
      "2026-09-22",
    );
  });

  it("日本時間の日付が変わる境目を正しく扱う", () => {
    assert.equal(
      toTokyoDateString(new Date("2026-09-22T14:59:59Z")),
      "2026-09-22",
    );
    assert.equal(
      toTokyoDateString(new Date("2026-09-22T15:00:00Z")),
      "2026-09-23",
    );
  });

  it("年をまたぐ場合も正しい", () => {
    // UTC 2025/12/31 15:00 = 日本時間 2026/1/1
    assert.equal(
      toTokyoDateString(new Date("2025-12-31T15:00:00Z")),
      "2026-01-01",
    );
  });

  it("常に YYYY-MM-DD の形式（ゼロ埋め）で返す", () => {
    assert.equal(
      toTokyoDateString(new Date("2026-01-05T00:00:00Z")),
      "2026-01-05",
    );
  });
});

describe("株価取得失敗の案内", () => {
  it("存在しない銘柄を案内する", () => {
    assert.match(
      stockFetchErrorMessage(
        "0000",
        new Error("No data found, symbol may be delisted"),
      ),
      /銘柄が見つからない/,
    );
  });
  it("通信エラーを案内する", () => {
    assert.match(
      stockFetchErrorMessage("7203", new TypeError("fetch failed")),
      /通信エラー/,
    );
  });
  it("Yahooの取得失敗で内部情報を表示しない", () => {
    const message = stockFetchErrorMessage(
      "7203",
      new Error("HTTP 429: internal detail"),
    );
    assert.match(message, /Yahoo Finance/);
    assert.doesNotMatch(message, /internal detail/);
  });
});

describe("toCandles（Yahooのレスポンスを Candle に変換）", () => {
  const row = (date: string, close: number) => ({
    date: new Date(`${date}T00:00:00Z`),
    open: close - 10,
    high: close + 20,
    low: close - 20,
    close,
    volume: 1000,
  });

  it("通常のデータをそのまま変換する", () => {
    const candles = toCandles([row("2026-09-17", 3034)]);

    assert.deepEqual(candles, [
      {
        date: "2026-09-17",
        open: 3024,
        high: 3054,
        low: 3014,
        close: 3034,
        volume: 1000,
      },
    ]);
  });

  it("四本値が欠けている足（売買停止日など）は除外する", () => {
    const candles = toCandles([
      row("2026-09-16", 3016),
      { ...row("2026-09-17", 3034), close: null },
      { ...row("2026-09-18", 3025), open: null },
      row("2026-09-19", 3040),
    ]);

    assert.deepEqual(
      candles.map((candle) => candle.date),
      ["2026-09-16", "2026-09-19"],
    );
  });

  it("出来高だけが欠けている場合は 0 として扱う", () => {
    const candles = toCandles([{ ...row("2026-09-18", 3025), volume: null }]);

    assert.equal(candles.length, 1);
    assert.equal(candles[0].volume, 0);
  });

  it("日付の昇順（古い順）に並べ替える", () => {
    const candles = toCandles([
      row("2026-09-18", 3025),
      row("2026-09-16", 3016),
      row("2026-09-17", 3034),
    ]);

    assert.deepEqual(
      candles.map((candle) => candle.date),
      ["2026-09-16", "2026-09-17", "2026-09-18"],
    );
  });

  it("空のデータなら空の配列を返す", () => {
    assert.deepEqual(toCandles([]), []);
  });
});

describe("resolvePeriod1（取得開始日の決定）", () => {
  it("数値を指定するとその日数だけ現在から遡った日付になる", () => {
    const now = Date.now();
    const period1 = resolvePeriod1(30);

    const diffDays = (now - period1.getTime()) / 86_400_000;
    assert.ok(
      Math.abs(diffDays - 30) < 0.01,
      `30日前になっていない: ${diffDays}日前`,
    );
  });

  it('"max" を指定すると十分に古い固定日付になる（Yahoo側で上場日にクランプされる）', () => {
    const period1 = resolvePeriod1("max");

    // どの銘柄の上場日よりも確実に古い日付であることだけを確認する
    assert.ok(period1.getFullYear() <= 1900);
  });
});
