import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CachedStock } from "./screeningPersistence.ts";
import {
  expectedLatestTradingDate,
  mergeCandles,
  shouldUseCachedStock,
} from "./screeningStockData.ts";
import type { Candle } from "./types.ts";

const candle = (date: string, close = 100): Candle => ({
  date,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1_000,
});

const cached = (
  latestDate: string,
  fetchedAt: string,
  checkedForDate?: string,
): CachedStock => ({
  fetchedAt,
  checkedForDate,
  name: "test",
  candles: [candle(latestDate)],
});

describe("スクリーニングキャッシュの営業日鮮度", () => {
  const afterClose = Date.parse("2026-09-24T10:00:00Z"); // 日本時間19時

  it("平日の18時以降は当日を期待基準日にする", () => {
    assert.equal(expectedLatestTradingDate(afterClose), "2026-09-24");
  });

  it("月曜の市場反映前は直前の平日を期待基準日にする", () => {
    assert.equal(
      expectedLatestTradingDate(Date.parse("2026-09-28T05:00:00Z")),
      "2026-09-25",
    );
  });

  it("12時間以内で最新日も期待日ならキャッシュを使う", () => {
    assert.equal(
      shouldUseCachedStock(
        cached("2026-09-24", "2026-09-24T06:00:00Z"),
        afterClose,
      ),
      true,
    );
  });

  it("12時間以内でも最新日が古く未確認なら再取得する", () => {
    assert.equal(
      shouldUseCachedStock(
        cached("2026-09-22", "2026-09-24T06:00:00Z"),
        afterClose,
      ),
      false,
    );
  });

  it("新データがなかった期待日を確認済みなら再試行しない", () => {
    assert.equal(
      shouldUseCachedStock(
        cached("2026-09-22", "2026-09-24T09:00:00Z", "2026-09-24"),
        afterClose,
      ),
      true,
    );
  });

  it("12時間を超えたキャッシュは従来どおり再取得する", () => {
    assert.equal(
      shouldUseCachedStock(
        cached("2026-09-24", "2026-09-23T21:59:59Z"),
        afterClose,
      ),
      false,
    );
  });

  it("再取得データは日付で結合し、新営業日の足を追加する", () => {
    assert.deepEqual(
      mergeCandles(
        [candle("2026-09-22", 100)],
        [candle("2026-09-22", 101), candle("2026-09-24", 102)],
      ).map(({ date, close }) => ({ date, close })),
      [
        { date: "2026-09-22", close: 101 },
        { date: "2026-09-24", close: 102 },
      ],
    );
    assert.deepEqual(
      mergeCandles([candle("2026-09-22")], [candle("2026-09-22")]).map(
        ({ date }) => date,
      ),
      ["2026-09-22"],
    );
  });
});
