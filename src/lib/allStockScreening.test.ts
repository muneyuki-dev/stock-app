import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeScreeningDates } from "./allStockScreening.ts";
import type { AllStockScreeningItem } from "./screeningPersistence.ts";

describe("全銘柄スクリーニングの基準日集計", () => {
  it("最多・古い基準日・取得日時・判定不能を集計する", () => {
    const items: AllStockScreeningItem[] = [
      {
        code: "1001",
        status: "success",
        latestDate: "2026-09-24",
        fetchedAt: "2026-09-24T09:00:00Z",
        screenedAt: "2026-09-24T09:10:00Z",
      },
      {
        code: "1002",
        status: "success",
        latestDate: "2026-09-24",
        fetchedAt: "2026-09-24T09:01:00Z",
        screenedAt: "2026-09-24T09:10:01Z",
      },
      {
        code: "1003",
        status: "screen_error",
        latestDate: "2026-09-18",
        fetchedAt: "2026-09-24T09:02:00Z",
        screenedAt: "2026-09-24T09:10:02Z",
      },
    ];
    assert.deepEqual(summarizeScreeningDates(items), {
      primaryDate: "2026-09-24",
      primaryDateCount: 2,
      staleDateCount: 1,
      dateDistribution: { "2026-09-24": 2, "2026-09-18": 1 },
      oldestDate: "2026-09-18",
      indeterminateCount: 1,
      fetchedAtMin: "2026-09-24T09:00:00Z",
      fetchedAtMax: "2026-09-24T09:02:00Z",
      staleStocks: [
        {
          code: "1003",
          latestDate: "2026-09-18",
          fetchedAt: "2026-09-24T09:02:00Z",
        },
      ],
    });
  });
});
