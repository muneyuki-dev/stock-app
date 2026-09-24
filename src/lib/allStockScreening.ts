import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  matchesScreenConditions,
  matchesScreeningSelection,
  rankScreeningResults,
  SCREEN_CONDITIONS,
  type ScreenCondition,
  scoreScreeningConditions,
  screeningMatchReasons,
  screenMovingAverageConditions,
} from "./screener.ts";
import {
  type AllStockScreeningItem,
  type AllStockScreeningRun,
  type AllStockScreeningStatus,
  loadScreeningRun,
  type SavedScreeningResult,
  saveScreeningRun,
} from "./screeningPersistence.ts";
import { loadScreeningStockData } from "./screeningStockData.ts";
import { activeCommonStocks } from "./stockMaster.ts";

export const ALL_STOCK_BATCH_SIZE = 50;
export const ALL_STOCK_CONCURRENCY = 2;
const RETRIES = 1;

type StartOptions = {
  readonly selectedConditions?: readonly ScreenCondition[];
  readonly matchMode?: "all" | "any";
  readonly minimumMatches?: number;
  readonly requiredConditions?: readonly ScreenCondition[];
  readonly limit?: number;
  readonly reset?: boolean;
};

declare global {
  var stockScreeningWorker: Promise<void> | undefined;
}

async function processOne(
  code: string,
  minimumMatches: number,
  requiredConditions: ReadonlySet<ScreenCondition>,
) {
  let fetched: Awaited<ReturnType<typeof loadScreeningStockData>> | null = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    fetched = await loadScreeningStockData(code);
    if (fetched.ok || attempt === RETRIES) break;
    await delay(500);
  }
  if (fetched === null || !fetched.ok) {
    const noData = /見つからない|データがありません|日足データ/.test(
      fetched?.error ?? "",
    );
    return {
      item: {
        code,
        status: noData ? "no_data" : "fetch_error",
        error: fetched?.error ?? "取得失敗",
      } satisfies AllStockScreeningItem,
      result: null,
      cacheHit: 0,
      cacheMiss: 1,
      yahooRequests: RETRIES + 1,
    };
  }
  const screened = screenMovingAverageConditions(fetched.value.candles);
  if (screened === null) {
    return {
      item: {
        code,
        status: "screen_error",
        error: "判定に必要な日足が不足しています。",
      } satisfies AllStockScreeningItem,
      result: null,
      cacheHit: fetched.value.cache === "hit" ? 1 : 0,
      cacheMiss: fetched.value.cache === "miss" ? 1 : 0,
      yahooRequests: fetched.value.yahooRequests,
    };
  }
  const score = scoreScreeningConditions(screened);
  const matchedReasons = screeningMatchReasons(
    screened,
    new Set(score.matchedConditions),
  );
  const allConditions = new Set(
    SCREEN_CONDITIONS.map((condition) => condition.key),
  );
  const anyMatch = matchesScreenConditions(screened, allConditions, "any");
  const allMatch = matchesScreenConditions(screened, allConditions, "all");
  const latest = fetched.value.candles[fetched.value.candles.length - 1];
  const result: SavedScreeningResult | null = matchesScreeningSelection(
    screened,
    { minimumMatches, requiredConditions },
  )
    ? {
        ...screened,
        code,
        name: fetched.value.name,
        volume: latest.volume,
        matchedReasons,
        ...score,
        matchedConditionNames: SCREEN_CONDITIONS.filter(({ key }) =>
          score.matchedConditions.includes(key),
        ).map(({ label }) => label),
        unmatchedConditionNames: SCREEN_CONDITIONS.filter(({ key }) =>
          score.unmatchedConditions.includes(key),
        ).map(({ label }) => label),
        screenedAt: new Date().toISOString(),
      }
    : null;
  return {
    item: { code, status: "success" } satisfies AllStockScreeningItem,
    result,
    conditions: screened.conditions,
    anyMatch,
    allMatch,
    cacheHit: fetched.value.cache === "hit" ? 1 : 0,
    cacheMiss: fetched.value.cache === "miss" ? 1 : 0,
    yahooRequests: fetched.value.yahooRequests,
  };
}

type ProcessOneOutput = Awaited<ReturnType<typeof processOne>>;

async function worker(): Promise<void> {
  while (true) {
    const run = await loadScreeningRun();
    if (run === null || run.state !== "running") return;
    const stocks = activeCommonStocks(run.total);
    const done = new Set(run.items.map((item) => item.code));
    const batch = stocks
      .filter((stock) => !done.has(stock.code))
      .slice(0, ALL_STOCK_BATCH_SIZE);
    if (batch.length === 0) {
      await saveScreeningRun({
        ...run,
        state: "completed",
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const outputs: ProcessOneOutput[] = [];
    for (let index = 0; index < batch.length; index += ALL_STOCK_CONCURRENCY) {
      outputs.push(
        ...(await Promise.all(
          batch
            .slice(index, index + ALL_STOCK_CONCURRENCY)
            .map((stock) =>
              processOne(
                stock.code,
                run.minimumMatches ?? (run.matchMode === "all" ? 7 : 1),
                new Set(run.requiredConditions ?? []),
              ),
            ),
        )),
      );
    }
    const current = (await loadScreeningRun()) ?? run;
    const items = [...current.items, ...outputs.map((output) => output.item)];
    const results = rankScreeningResults([
      ...current.results,
      ...outputs.flatMap((output) =>
        output.result === null ? [] : [output.result],
      ),
    ]);
    const conditionHits = Object.fromEntries(
      SCREEN_CONDITIONS.map(({ key }) => [
        key,
        (current.conditionHits?.[key] ?? 0) +
          outputs.filter((output) => output.conditions?.[key] === true).length,
      ]),
    ) as Record<ScreenCondition, number>;
    await saveScreeningRun({
      ...current,
      processed: items.length,
      successful: items.filter((item) => item.status === "success").length,
      failed: items.filter((item) => item.status !== "success").length,
      matched: results.length,
      anyMatched:
        (current.anyMatched ?? 0) +
        outputs.filter((output) => output.anyMatch === true).length,
      allMatched:
        (current.allMatched ?? 0) +
        outputs.filter((output) => output.allMatch === true).length,
      conditionHits,
      cacheHits:
        current.cacheHits +
        outputs.reduce((sum, output) => sum + output.cacheHit, 0),
      cacheMisses:
        current.cacheMisses +
        outputs.reduce((sum, output) => sum + output.cacheMiss, 0),
      yahooRequests:
        current.yahooRequests +
        outputs.reduce((sum, output) => sum + output.yahooRequests, 0),
      items,
      results,
      updatedAt: new Date().toISOString(),
    });
  }
}

export function ensureScreeningWorker(): void {
  if (globalThis.stockScreeningWorker !== undefined) return;
  globalThis.stockScreeningWorker = worker().finally(() => {
    globalThis.stockScreeningWorker = undefined;
  });
}

export async function startAllStockScreening(
  options: StartOptions = {},
): Promise<AllStockScreeningRun> {
  const existing = await loadScreeningRun();
  if (existing?.state === "running" && !options.reset) {
    ensureScreeningWorker();
    return existing;
  }
  const stocks = activeCommonStocks(options.limit);
  const minimumMatches = Math.min(
    SCREEN_CONDITIONS.length,
    Math.max(
      1,
      Math.trunc(
        options.minimumMatches ?? (options.matchMode === "all" ? 7 : 1),
      ),
    ),
  );
  const now = new Date().toISOString();
  const run: AllStockScreeningRun = {
    id: randomUUID(),
    state: "running",
    total: stocks.length,
    processed: 0,
    successful: 0,
    matched: 0,
    anyMatched: 0,
    allMatched: 0,
    conditionHits: Object.fromEntries(
      SCREEN_CONDITIONS.map(({ key }) => [key, 0]),
    ) as Record<ScreenCondition, number>,
    failed: 0,
    cacheHits: 0,
    cacheMisses: 0,
    yahooRequests: 0,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    selectedConditions:
      options.selectedConditions ??
      SCREEN_CONDITIONS.map((condition) => condition.key),
    matchMode: options.matchMode ?? "any",
    minimumMatches,
    requiredConditions: options.requiredConditions ?? [],
    items: [],
    results: [],
  };
  await saveScreeningRun(run);
  ensureScreeningWorker();
  return run;
}

export async function getAllStockScreeningRun(): Promise<AllStockScreeningRun | null> {
  const run = await loadScreeningRun();
  if (run?.state === "running") ensureScreeningWorker();
  return run;
}

export function screeningStatus(
  run: AllStockScreeningRun,
): AllStockScreeningStatus {
  const { items: _items, results: _results, ...status } = run;
  return status;
}

export async function getAllStockScreeningStatus(): Promise<AllStockScreeningStatus | null> {
  const run = await getAllStockScreeningRun();
  return run === null ? null : screeningStatus(run);
}
