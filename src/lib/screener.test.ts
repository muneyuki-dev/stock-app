import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { screenMovingAverageConditions } from "./screener.ts";
import type { Candle } from "./types.ts";

function barsFromCloses(
  closes: readonly number[],
  volumes: readonly number[] = closes.map(() => 1_000),
): Candle[] {
  const start = Date.UTC(2025, 0, 1);
  return closes.map((close, index) => ({
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: volumes[index] ?? 1_000,
  }));
}

describe("screenMovingAverageConditions", () => {
  it("200日線の計算に必要なデータがなければ null", () => {
    assert.equal(
      screenMovingAverageConditions(barsFromCloses([1, 2, 3])),
      null,
    );
  });

  it("75日線との差が±3%以内なら『75日線付近』", () => {
    const closes = new Array(210).fill(100);
    closes[209] = 102;
    const result = screenMovingAverageConditions(barsFromCloses(closes));

    assert.ok(result);
    assert.equal(result.conditions.near75, true);
    assert.ok(Math.abs(result.distanceFrom75Percent) <= 3);
  });

  it("直近5営業日で終値が75日線を下から上へ抜けたら検出", () => {
    const closes = new Array(205).fill(100);
    closes.push(99, 99, 101, 102, 103);
    const bars = barsFromCloses(closes);
    const result = screenMovingAverageConditions(bars);

    assert.ok(result);
    assert.equal(result.conditions.cross75, true);
    assert.equal(result.cross75Date, bars[207].date);
  });

  it("25・75・200日線がすべて5営業日前より高ければ上向き", () => {
    const closes = Array.from({ length: 260 }, (_, index) => 100 + index);
    const result = screenMovingAverageConditions(barsFromCloses(closes));

    assert.ok(result);
    assert.equal(result.conditions.risingMas, true);
  });

  it("1本でも下向きなら『移動平均線が上向き』にはしない", () => {
    const closes = [
      ...Array.from({ length: 250 }, (_, index) => 100 + index),
      340,
      330,
      320,
      310,
      300,
      290,
    ];
    const result = screenMovingAverageConditions(barsFromCloses(closes));

    assert.ok(result);
    assert.equal(result.conditions.risingMas, false);
  });

  it("当日の出来高が直前20本平均の1.5倍以上なら急増", () => {
    const closes = new Array(220).fill(100);
    const volumes = closes.map(() => 1_000);
    volumes[volumes.length - 1] = 1_500;
    const result = screenMovingAverageConditions(
      barsFromCloses(closes, volumes),
    );

    assert.ok(result);
    assert.equal(result.volumeRatio, 1.5);
    assert.equal(result.conditions.volumeSurge, true);
  });

  it("終値が52週高値まで5%以内なら高値接近", () => {
    const closes = Array.from({ length: 260 }, (_, index) => 100 + index * 0.1);
    const result = screenMovingAverageConditions(barsFromCloses(closes));

    assert.ok(result);
    assert.ok(result.distanceFromYearHighPercent >= -5);
    assert.equal(result.conditions.nearYearHigh, true);
  });

  it("75日線の上0〜8%なら離れすぎていない", () => {
    const closes = new Array(220).fill(100);
    closes[closes.length - 1] = 105;
    const result = screenMovingAverageConditions(barsFromCloses(closes));

    assert.ok(result);
    assert.equal(result.conditions.notExtended75, true);
  });
});
