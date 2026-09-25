import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchedSignalGroups,
  matchesScreenConditions,
  matchesScreeningSelection,
  passesLiquidityFilter,
  rankScreeningResults,
  scoreScreeningConditions,
  screeningMatchReasons,
  screenMovingAverageConditions,
} from "./screener.ts";
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

describe("条件の組み合わせと一致理由", () => {
  it("流動性フィルターは7条件とは別に20日平均売買代金を判定する", () => {
    assert.equal(
      passesLiquidityFilter(
        { averageTurnoverValue20d: 50_000_000 },
        30_000_000,
      ),
      true,
    );
    assert.equal(
      passesLiquidityFilter({ averageTurnoverValue20d: null }, 30_000_000),
      false,
    );
    assert.equal(
      passesLiquidityFilter({ averageTurnoverValue20d: null }, null),
      true,
    );
    assert.equal(
      passesLiquidityFilter({ averageTurnoverValue20d: null }, 0),
      true,
    );
  });
  it("near75とnotExtended75が一致してもpositionは1グループ", () => {
    const result = screenMovingAverageConditions(
      barsFromCloses(new Array(220).fill(100)),
    );
    assert.ok(result);
    assert.equal(result.conditions.near75, true);
    assert.equal(result.conditions.notExtended75, true);
    assert.equal(
      matchedSignalGroups(result).filter((group) => group === "position")
        .length,
      1,
    );
  });
  it("anyは1条件、allは選択した全条件がtrueの場合だけ一致する", () => {
    const result = screenMovingAverageConditions(
      barsFromCloses(new Array(220).fill(100)),
    );
    assert.ok(result);
    const selected = new Set(["near75", "volumeSurge"] as const);

    assert.equal(matchesScreenConditions(result, selected, "any"), true);
    assert.equal(matchesScreenConditions(result, selected, "all"), false);
    assert.equal(matchesScreenConditions(result, new Set(), "any"), false);
  });

  it("1-of-7はOR、7-of-7はANDと同じになる", () => {
    const base = screenMovingAverageConditions(
      barsFromCloses(new Array(220).fill(100)),
    );
    assert.ok(base);
    const allConditions = new Set(
      Object.keys(base.conditions) as (keyof typeof base.conditions)[],
    );
    assert.equal(
      matchesScreeningSelection(base, {
        minimumMatches: 1,
        requiredConditions: new Set(),
      }),
      matchesScreenConditions(base, allConditions, "any"),
    );
    assert.equal(
      matchesScreeningSelection(base, {
        minimumMatches: 7,
        requiredConditions: new Set(),
      }),
      matchesScreenConditions(base, allConditions, "all"),
    );
  });

  it("N-of-7と複数の必須条件を共通の7条件で判定する", () => {
    const base = screenMovingAverageConditions(
      barsFromCloses(new Array(220).fill(100)),
    );
    assert.ok(base);
    const result = {
      ...base,
      conditions: {
        near75: true,
        notExtended75: true,
        cross75: false,
        risingMas: true,
        volumeSurge: false,
        nearYearHigh: false,
        firstPullback: false,
      },
    };
    const score = scoreScreeningConditions(result);
    assert.equal(score.matchCount, 3);
    assert.equal(score.totalConditions, 7);
    assert.deepEqual(score.matchedConditions, [
      "near75",
      "notExtended75",
      "risingMas",
    ]);
    assert.equal(
      matchesScreeningSelection(result, {
        minimumMatches: 3,
        requiredConditions: new Set(["risingMas", "near75"]),
      }),
      true,
    );
    assert.equal(
      matchesScreeningSelection(result, {
        minimumMatches: 3,
        requiredConditions: new Set(["cross75"]),
      }),
      false,
    );
    assert.equal(
      matchesScreeningSelection(result, {
        minimumMatches: 4,
        requiredConditions: new Set(),
      }),
      false,
    );
  });

  it("一致数の降順に並べ、同数なら元の順序を保つ", () => {
    const base = screenMovingAverageConditions(
      barsFromCloses(new Array(220).fill(100)),
    );
    assert.ok(base);
    const make = (id: string, count: number) => ({
      id,
      conditions: Object.fromEntries(
        Object.keys(base.conditions).map((key, index) => [key, index < count]),
      ) as typeof base.conditions,
    });
    assert.deepEqual(
      rankScreeningResults([make("a", 2), make("b", 4), make("c", 2)]).map(
        ({ id }) => id,
      ),
      ["b", "a", "c"],
    );
  });

  it("一致理由に実測値と閾値を含める", () => {
    const result = screenMovingAverageConditions(
      barsFromCloses(new Array(220).fill(100)),
    );
    assert.ok(result);
    const reasons = screeningMatchReasons(result, new Set(["near75"]));

    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /75日線乖離 \+0\.00%/);
    assert.match(reasons[0], /基準 ±3%/);
  });
});
