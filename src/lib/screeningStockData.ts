import { loadStockCache, saveStockCache } from "./screeningPersistence.ts";
import type { Candle, Result } from "./types.ts";
import { fetchDailyCandles } from "./yahoo.ts";

const CACHE_FRESH_MS = 12 * 60 * 60 * 1000;
const INITIAL_LOOKBACK_DAYS = 420;
const MS_PER_DAY = 86_400_000;

export type ScreeningStockData = {
  readonly name: string | null;
  readonly candles: readonly Candle[];
  readonly cache: "hit" | "miss";
  readonly yahooRequests: number;
};

function mergeCandles(
  previous: readonly Candle[],
  incoming: readonly Candle[],
): Candle[] {
  const byDate = new Map(previous.map((candle) => [candle.date, candle]));
  for (const candle of incoming) byDate.set(candle.date, candle);
  return [...byDate.values()].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

export async function loadScreeningStockData(
  code: string,
  now = Date.now(),
): Promise<Result<ScreeningStockData>> {
  const cached = await loadStockCache(code);
  const fresh =
    cached !== null && now - Date.parse(cached.fetchedAt) < CACHE_FRESH_MS;
  if (fresh) {
    return {
      ok: true,
      value: {
        name: cached.name,
        candles: cached.candles,
        cache: "hit",
        yahooRequests: 0,
      },
    };
  }

  let lookbackDays = INITIAL_LOOKBACK_DAYS;
  if (cached?.candles.length) {
    const latest = cached.candles[cached.candles.length - 1].date;
    lookbackDays = Math.max(
      10,
      Math.ceil((now - Date.parse(`${latest}T00:00:00+09:00`)) / MS_PER_DAY) +
        7,
    );
  }
  const fetched = await fetchDailyCandles(code, { lookbackDays });
  if (!fetched.ok) return fetched;

  const candles = mergeCandles(cached?.candles ?? [], fetched.value.candles);
  await saveStockCache(code, {
    fetchedAt: new Date(now).toISOString(),
    name: fetched.value.name,
    candles,
  });
  return {
    ok: true,
    value: {
      name: fetched.value.name,
      candles,
      cache: "miss",
      yahooRequests: 1,
    },
  };
}
