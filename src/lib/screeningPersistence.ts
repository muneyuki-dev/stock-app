import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ScreenCondition,
  ScreeningMatchMode,
  StockScreeningResult,
} from "./screener.ts";
import type { Candle } from "./types.ts";

export const SCREENING_DATA_DIR =
  process.env.SCREENING_DATA_DIR?.trim() || path.join(process.cwd(), ".data");

export type ScreeningItemStatus =
  | "success"
  | "no_data"
  | "fetch_error"
  | "screen_error";

export type AllStockScreeningItem = {
  readonly code: string;
  readonly status: ScreeningItemStatus;
  readonly error?: string;
  readonly latestDate?: string;
  readonly fetchedAt?: string;
  readonly screenedAt?: string;
};

export type SavedScreeningResult = StockScreeningResult & {
  readonly matchedReasons: readonly string[];
  readonly screenedAt: string;
  readonly fetchedAt: string;
  readonly matchCount: number;
  readonly totalConditions: number;
  readonly matchRate: number;
  readonly matchedConditions: readonly ScreenCondition[];
  readonly unmatchedConditions: readonly ScreenCondition[];
  readonly matchedConditionNames: readonly string[];
  readonly unmatchedConditionNames: readonly string[];
};

export type ScreeningDateSummary = {
  readonly primaryDate: string | null;
  readonly primaryDateCount: number;
  readonly staleDateCount: number;
  readonly dateDistribution: Readonly<Record<string, number>>;
  readonly oldestDate: string | null;
  readonly indeterminateCount: number;
  readonly fetchedAtMin: string | null;
  readonly fetchedAtMax: string | null;
  readonly staleStocks: readonly {
    readonly code: string;
    readonly latestDate: string;
    readonly fetchedAt?: string;
  }[];
};

export type AllStockScreeningRun = {
  readonly id: string;
  readonly state: "running" | "completed" | "stopped";
  readonly total: number;
  readonly processed: number;
  readonly successful: number;
  readonly matched: number;
  readonly anyMatched: number;
  readonly allMatched: number;
  readonly conditionHits: Readonly<Record<ScreenCondition, number>>;
  readonly failed: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly yahooRequests: number;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly selectedConditions?: readonly ScreenCondition[];
  readonly matchMode?: ScreeningMatchMode;
  readonly minimumMatches: number;
  readonly requiredConditions: readonly ScreenCondition[];
  readonly minimumAverageTurnover20d?: number | null;
  readonly dateSummary?: ScreeningDateSummary;
  readonly items: readonly AllStockScreeningItem[];
  readonly results: readonly SavedScreeningResult[];
};

export type AllStockScreeningStatus = Omit<
  AllStockScreeningRun,
  "items" | "results"
>;

export type CachedStock = {
  readonly fetchedAt: string;
  readonly checkedForDate?: string;
  readonly name: string | null;
  readonly candles: readonly Candle[];
};

const runFile = path.join(SCREENING_DATA_DIR, "all-stock-screening.json");

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT" ||
      error instanceof SyntaxError
    )
      return null;
    throw error;
  }
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, "utf8");
  await rename(temporary, file);
}

export const loadScreeningRun = async () => {
  const run = await readJson<AllStockScreeningRun>(runFile);
  return run !== null && typeof run.id === "string" && Array.isArray(run.items)
    ? run
    : null;
};
export const saveScreeningRun = (run: AllStockScreeningRun) =>
  writeJsonAtomic(runFile, run);

function cacheFile(code: string): string {
  return path.join(SCREENING_DATA_DIR, "stock-cache", `${code}.json`);
}

export const loadStockCache = async (code: string) => {
  const cached = await readJson<CachedStock>(cacheFile(code));
  return cached !== null &&
    typeof cached.fetchedAt === "string" &&
    Array.isArray(cached.candles)
    ? cached
    : null;
};
export const saveStockCache = (code: string, value: CachedStock) =>
  writeJsonAtomic(cacheFile(code), value);
