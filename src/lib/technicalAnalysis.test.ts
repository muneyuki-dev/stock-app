import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateWeeklyCandles,
  analyzeTechnicalSnapshot,
  findSupportResistance,
} from "./technicalAnalysis.ts";
import type { Candle } from "./types.ts";

function candlesFromCloses(
  closes: readonly number[],
  volumes: readonly number[] = closes.map(() => 1_000),
): Candle[] {
  const start = Date.UTC(2024, 0, 1);
  return closes.map((close, index) => ({
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: volumes[index] ?? 1_000,
  }));
}

describe("aggregateWeeklyCandles", () => {
  it("週の最初の始値、最高値、最安値、最後の終値、合計出来高を使う", () => {
    const candles: Candle[] = [
      {
        date: "2026-09-21",
        open: 100,
        high: 105,
        low: 99,
        close: 104,
        volume: 10,
      },
      {
        date: "2026-09-22",
        open: 104,
        high: 108,
        low: 103,
        close: 107,
        volume: 20,
      },
      {
        date: "2026-09-28",
        open: 110,
        high: 112,
        low: 109,
        close: 111,
        volume: 30,
      },
    ];

    assert.deepEqual(aggregateWeeklyCandles(candles), [
      {
        date: "2026-09-22",
        open: 100,
        high: 108,
        low: 99,
        close: 107,
        volume: 30,
      },
      {
        date: "2026-09-28",
        open: 110,
        high: 112,
        low: 109,
        close: 111,
        volume: 30,
      },
    ]);
  });
});

describe("analyzeTechnicalSnapshot", () => {
  it("当日と直前20日の売買代金を計算する", () => {
    const candles = Array.from({ length: 220 }, (_, index) => ({
      date: `2025-01-${String(index + 1).padStart(2, "0")}`,
      open: 100,
      high: 101,
      low: 99,
      close: index === 219 ? 200 : 100,
      volume: index === 219 ? 2_000 : 1_000,
    }));
    const result = analyzeTechnicalSnapshot(candles);
    assert.equal(result?.turnoverValue, 400_000);
    assert.equal(result?.averageTurnoverValue20d, 100_000);
    assert.equal(result?.turnoverRatio20d, 4);
  });

  it("直前20日の売買代金が不足する場合はnullを保持する", () => {
    const candles = Array.from({ length: 220 }, (_, index) => ({
      date: `2025-01-${String(index + 1).padStart(2, "0")}`,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: index === 210 ? 0 : 1_000,
    }));
    const result = analyzeTechnicalSnapshot(candles);
    assert.equal(result?.averageTurnoverValue20d, null);
    assert.equal(result?.turnoverRatio20d, null);
  });
  it("200本未満では移動平均の診断を行わない", () => {
    assert.equal(analyzeTechnicalSnapshot(candlesFromCloses([100, 101])), null);
  });

  it("移動平均の上向き・強気配列・出来高急増を数値で返す", () => {
    const closes = Array.from({ length: 260 }, (_, index) => 100 + index * 0.4);
    const volumes = closes.map(() => 1_000);
    volumes[volumes.length - 1] = 2_000;
    const result = analyzeTechnicalSnapshot(candlesFromCloses(closes, volumes));

    assert.ok(result);
    assert.deepEqual(result.maDirections, {
      "25": "rising",
      "75": "rising",
      "200": "rising",
    });
    assert.equal(result.maAlignment, "bullish");
    assert.equal(result.volumeRatio, 2);
    assert.ok(result.distanceFromYearHighPercent <= 0);
    assert.ok(result.distanceFromYearLowPercent > 0);
  });

  it("出来高平均は当日を除く直前20本で計算する", () => {
    const closes = new Array(220).fill(100);
    const volumes = closes.map(() => 100);
    volumes[volumes.length - 1] = 300;
    const result = analyzeTechnicalSnapshot(candlesFromCloses(closes, volumes));

    assert.ok(result);
    assert.equal(result.averageVolume20, 100);
    assert.equal(result.volumeRatio, 3);
  });
});

describe("findSupportResistance", () => {
  it("2%以内で2回以上反応した価格帯を候補にする", () => {
    const closes = [
      105, 106, 104, 102, 100, 103, 106, 109, 111, 108, 105, 102, 100.5, 103,
      106, 109, 111.5, 108, 105, 104,
    ];
    const candles = candlesFromCloses(closes).map((candle, index) => ({
      ...candle,
      low: index === 4 ? 99 : index === 12 ? 99.5 : candle.low,
      high: index === 8 ? 112 : index === 16 ? 112.5 : candle.high,
    }));
    const result = findSupportResistance(candles);

    assert.ok(result.supports.some((level) => level.touches >= 2));
    assert.ok(result.resistances.some((level) => level.touches >= 2));
  });
});
