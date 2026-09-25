import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aiScreeningFilename,
  createAiScreeningExport,
} from "./aiScreeningExport.ts";
import type {
  AllStockScreeningRun,
  SavedScreeningResult,
} from "./screeningPersistence.ts";

const baseResult: SavedScreeningResult = {
  code: "7203",
  name: "トヨタ自動車",
  latestDate: "2026-09-23",
  fetchedAt: "2026-09-24T08:00:00.000Z",
  screenedAt: "2026-09-24T08:05:00.000Z",
  close: 3124.5,
  volume: 12345678,
  averageVolume20: 6_783_944,
  turnoverValue: 38_580_246_531,
  averageTurnoverValue20d: 20_000_000_000,
  turnoverRatio20d: 1.929,
  sma25: 3000,
  sma75: 3050,
  sma200: 2800,
  distanceFrom75Percent: 2.4426,
  volumeRatio: 1.82,
  distanceFromYearHighPercent: -4.2,
  yearHigh: 3261.5,
  yearLow: 2200,
  cross75Date: null,
  firstPullbackDate: null,
  conditions: {
    near75: true,
    notExtended75: true,
    cross75: false,
    risingMas: true,
    volumeSurge: true,
    nearYearHigh: true,
    firstPullback: false,
  },
  matchedReasons: [
    "75日線乖離 +2.44%（基準 ±3%）",
    "出来高20日平均比 1.82倍（基準 1.5倍以上）",
  ],
  matchCount: 5,
  totalConditions: 7,
  matchRate: 5 / 7,
  matchedConditions: [
    "near75",
    "notExtended75",
    "risingMas",
    "volumeSurge",
    "nearYearHigh",
  ],
  unmatchedConditions: ["cross75", "firstPullback"],
  matchedConditionNames: [
    "75日線付近",
    "75日線から離れすぎていない",
    "移動平均線が上向き",
    "出来高が急増",
    "52週高値に接近",
  ],
  unmatchedConditionNames: ["75日線を上抜け", "ゴールデンクロス後の初押し"],
};

function makeRun(
  minimumMatches: number,
  requiredConditions: AllStockScreeningRun["requiredConditions"] = [],
): AllStockScreeningRun {
  return {
    id: "run-1",
    state: "completed",
    total: 3700,
    processed: 3700,
    successful: 3652,
    matched: 1,
    anyMatched: 3022,
    allMatched: 0,
    conditionHits: {
      near75: 1,
      notExtended75: 1,
      cross75: 0,
      risingMas: 1,
      volumeSurge: 1,
      nearYearHigh: 1,
      firstPullback: 0,
    },
    failed: 48,
    cacheHits: 3700,
    cacheMisses: 0,
    yahooRequests: 0,
    startedAt: "2026-09-24T07:00:00.000Z",
    updatedAt: "2026-09-24T08:10:00.000Z",
    completedAt: "2026-09-24T08:10:00.000Z",
    minimumMatches,
    requiredConditions,
    dateSummary: {
      primaryDate: "2026-09-24",
      primaryDateCount: 3684,
      staleDateCount: 16,
      dateDistribution: { "2026-09-24": 3684, "2026-09-23": 16 },
      oldestDate: "2026-09-23",
      indeterminateCount: 48,
      fetchedAtMin: "2026-09-24T08:00:00.000Z",
      fetchedAtMax: "2026-09-24T08:00:00.000Z",
      staleStocks: [],
    },
    items: [],
    results: [baseResult],
  };
}

describe("AI分析用スクリーニングJSON", () => {
  for (const minimumMatches of [4, 5]) {
    it(`${minimumMatches}-of-7を保存結果だけから出力する`, () => {
      const output = createAiScreeningExport(
        makeRun(minimumMatches),
        "2026-09-25T00:00:00.000Z",
      );
      assert.equal(output.metadata.minMatchedConditions, minimumMatches);
      assert.equal(output.metadata.matchedStocks, output.results.length);
      assert.equal(output.metadata.primaryDate, "2026-09-24");
      assert.equal(output.metadata.staleDateCount, 16);
      assert.equal(output.screeningDefinition.conditions.length, 7);
      assert.equal(output.results[0].ticker, "7203.T");
      assert.equal(output.results[0].isStale, true);
      assert.equal(output.results[0].daysBehindPrimaryDate, 1);
      assert.equal(typeof output.results[0].close, "number");
      assert.equal(output.results[0].technicalValues.sma5, null);
      assert.equal(output.results[0].turnoverValue, 38_580_246_531);
      assert.equal(output.results[0].averageTurnoverValue20d, 20_000_000_000);
      assert.equal(output.results[0].turnoverRatio20d, 1.929);
      assert.deepEqual(output.results[0].matchedSignalGroups, [
        "position",
        "trend",
        "volume",
        "breakout",
      ]);
      assert.equal(output.results[0].matchedSignalGroupCount, 4);
      assert.equal(output.screeningDefinition.signalGroups.near75, "position");
      assert.equal(output.results[0].matchedConditions[0].id, "near75");
      assert.match(output.results[0].reasons[1], /1\.82倍/);
    });
  }

  it("初押し必須設定と短いファイル名を保持する", () => {
    const run = makeRun(4, ["firstPullback"]);
    const output = createAiScreeningExport(run);
    assert.deepEqual(output.metadata.requiredConditions, [
      {
        id: "firstPullback",
        name: "ゴールデンクロス後の初押し",
        description:
          "25日/75日ゴールデンクロス後に8%以上上昇し、75日線の0〜5%上へ初めて戻った日から3営業日以内",
      },
    ]);
    assert.equal(
      aiScreeningFilename(run),
      "ai-stock-screening-2026-09-24-4of7-first-pullback.json",
    );
  });
});
