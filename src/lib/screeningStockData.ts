import {
  type CachedStock,
  loadStockCache,
  saveStockCache,
} from "./screeningPersistence.ts";
import type { Candle, Result } from "./types.ts";
import { fetchDailyCandles } from "./yahoo.ts";

const CACHE_FRESH_MS = 12 * 60 * 60 * 1000;
const INITIAL_LOOKBACK_DAYS = 420;
const MS_PER_DAY = 86_400_000;
const MARKET_DATA_READY_HOUR = 18;

const tokyoParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

export type ScreeningStockData = {
  readonly name: string | null;
  readonly candles: readonly Candle[];
  readonly cache: "hit" | "miss";
  readonly yahooRequests: number;
  readonly fetchedAt: string;
  readonly latestDate: string;
};

function previousWeekday(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day, 12));
  do cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6);
  return cursor.toISOString().slice(0, 10);
}

export function expectedLatestTradingDate(now = Date.now()): string {
  const parts = tokyoParts.formatToParts(new Date(now));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const today = `${value("year")}-${value("month")}-${value("day")}`;
  const weekday = value("weekday");
  const hour = Number(value("hour"));
  const isWeekday = weekday !== "Sat" && weekday !== "Sun";
  return isWeekday && hour >= MARKET_DATA_READY_HOUR
    ? today
    : previousWeekday(today);
}

export function shouldUseCachedStock(
  cached: CachedStock | null,
  now = Date.now(),
): boolean {
  if (cached === null || cached.candles.length === 0) return false;
  const fresh = now - Date.parse(cached.fetchedAt) < CACHE_FRESH_MS;
  if (!fresh) return false;
  const expectedDate = expectedLatestTradingDate(now);
  const latestDate = cached.candles[cached.candles.length - 1].date;
  return latestDate >= expectedDate || cached.checkedForDate === expectedDate;
}

export function mergeCandles(
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
  if (cached !== null && shouldUseCachedStock(cached, now)) {
    return {
      ok: true,
      value: {
        name: cached.name,
        candles: cached.candles,
        cache: "hit",
        yahooRequests: 0,
        fetchedAt: cached.fetchedAt,
        latestDate: cached.candles[cached.candles.length - 1].date,
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
  const fetchedAt = new Date(now).toISOString();
  await saveStockCache(code, {
    fetchedAt,
    checkedForDate: expectedLatestTradingDate(now),
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
      fetchedAt,
      latestDate: candles[candles.length - 1].date,
    },
  };
}
