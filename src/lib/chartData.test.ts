/**
 * チャート表示用データの組み立てのテスト。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildChartViewModel,
  PERIOD_OPTIONS,
  periodToDays,
} from "./chartData.ts";
import type { Candle } from "./types.ts";

/** 指定日数分の日足ダミーデータを作る（土日を含む連続した暦日） */
function makeCandles(days: number): Candle[] {
  const start = Date.UTC(2024, 0, 1);

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    const close = 1000 + i;
    return { date, open: close, high: close, low: close, close, volume: 100 };
  });
}

describe("buildChartViewModel", () => {
  it("candles と各移動平均が同じ長さ・同じ添字で対応する", () => {
    const view = buildChartViewModel(makeCandles(560), 365);

    assert.equal(view.candles.length, view.sma5.length);
    assert.equal(view.candles.length, view.sma25.length);
    assert.equal(view.candles.length, view.sma75.length);
  });

  it("実運用と同じ規模（560暦日取得・365暦日表示）で75日線が左端から欠けない", () => {
    // yahoo.ts の DEFAULT_LOOKBACK_DAYS(560) / chartData.ts の DISPLAY_DAYS(365)
    // と同じ関係になっているかを確認する
    const view = buildChartViewModel(makeCandles(560), 365);

    assert.ok(view.candles.length > 0, "表示データが空になっている");
    assert.ok(
      view.sma75.every((value) => value !== null),
      "表示期間の中に75日線が未確定(null)の日がある",
    );
  });

  it("表示期間だけに絞り込まれる（全期間より短くなる）", () => {
    const view = buildChartViewModel(makeCandles(560), 365);

    assert.ok(view.candles.length < 560);
    // 365暦日ぶんの日付レンジになっているか（±数日の誤差は許容）
    const first = new Date(`${view.candles[0].date}T00:00:00Z`);
    const last = new Date(
      `${view.candles[view.candles.length - 1].date}T00:00:00Z`,
    );
    const diffDays = (last.getTime() - first.getTime()) / 86_400_000;
    assert.ok(diffDays <= 365, `表示期間が365日を超えている: ${diffDays}日`);
  });

  it("取得データが表示期間より短い場合は全部そのまま表示する", () => {
    const view = buildChartViewModel(makeCandles(30), 365);

    assert.equal(view.candles.length, 30);
  });

  it("データが空でも落ちない", () => {
    const view = buildChartViewModel([], 365);

    assert.deepEqual(view.candles, []);
    assert.deepEqual(view.sma5, []);
    assert.equal(view.latest["5/25"], null);
  });

  it("latest/history は表示期間ではなく全期間から判定される", () => {
    // 全期間の先頭付近（表示期間より古い）にだけクロスが起きるデータを作る
    const closes: number[] = [];
    for (let i = 0; i < 100; i++) closes.push(200 - i); // 下落
    for (let i = 0; i < 480; i++) closes.push(101 + i * 0.5); // 上昇し続ける

    const start = Date.UTC(2024, 0, 1);
    const candles: Candle[] = closes.map((close, i) => ({
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      open: close,
      high: close,
      low: close,
      close,
      volume: 100,
    }));

    const view = buildChartViewModel(candles, 365);
    const signal = view.latest["5/25"];

    assert.ok(signal !== null, "全期間で見ればクロスが検出されるはず");
    // クロスの発生日が、表示期間の開始日より前（=表示範囲外）であることを確認
    assert.ok(
      signal.date < view.candles[0].date,
      "このテストはクロスが表示範囲より前に起きるデータを前提にしている",
    );
  });
});

describe("periodToDays", () => {
  it("各期間キーに対応する暦日数を返す", () => {
    assert.equal(periodToDays("3m"), 90);
    assert.equal(periodToDays("6m"), 180);
    assert.equal(periodToDays("1y"), 365);
    assert.equal(periodToDays("3y"), 365 * 3);
    assert.equal(periodToDays("5y"), 365 * 5);
    assert.equal(periodToDays("10y"), 365 * 10);
  });

  it('"max" は null（=全期間表示）を返す', () => {
    assert.equal(periodToDays("max"), null);
  });

  it("PERIOD_OPTIONS に定義されたキーがすべて解決できる", () => {
    for (const option of PERIOD_OPTIONS) {
      assert.equal(periodToDays(option.key), option.days);
    }
  });
});

describe("buildChartViewModel（期間選択・displayDays=null）", () => {
  it("null を渡すと全期間がそのまま返る（絞り込みなし）", () => {
    const candles = makeCandles(500);
    const view = buildChartViewModel(candles, null);

    assert.equal(view.candles.length, 500);
    assert.deepEqual(view.candles, candles);
  });

  it("全期間表示では、上場直後（先頭74本）以外の75日線にnullがない", () => {
    const candles = makeCandles(500);
    const view = buildChartViewModel(candles, null);

    const nullIndexes = view.sma75
      .map((value, i) => (value === null ? i : -1))
      .filter((i) => i !== -1);

    assert.deepEqual(
      nullIndexes,
      Array.from({ length: 74 }, (_, i) => i),
      "75日線がnullなのは助走期間の先頭74本だけであるべき",
    );
  });

  /**
   * 実運用の規模（11年ぶんの日足）で、7つの表示期間すべてを検証する。
   * 各期間で「75日線が表示範囲の左端から欠けていない」ことが
   * PriceChart に渡す直前の最終防衛線になる。
   */
  it("3か月〜10年のすべての期間で、表示範囲内の75日線が欠けない", () => {
    const candles = makeCandles(11 * 365); // 約11年ぶん

    for (const option of PERIOD_OPTIONS) {
      if (option.days === null) {
        continue; // "max" は別のテストで検証する
      }

      const view = buildChartViewModel(candles, option.days);

      assert.ok(view.candles.length > 0, `${option.label}: 表示データが空`);
      assert.ok(
        view.sma75.every((value) => value !== null),
        `${option.label}: 75日線がnullの日がある`,
      );
    }
  });

  it("表示期間を切り替えても candles と各移動平均の長さは常に一致する", () => {
    const candles = makeCandles(11 * 365);

    for (const option of PERIOD_OPTIONS) {
      const view = buildChartViewModel(candles, option.days);

      assert.equal(view.candles.length, view.sma5.length, option.label);
      assert.equal(view.candles.length, view.sma25.length, option.label);
      assert.equal(view.candles.length, view.sma75.length, option.label);
    }
  });
});
