import { readFileSync } from "node:fs";
import path from "node:path";

export type StockMasterEntry = {
  readonly code: string;
  readonly ticker: string;
  readonly name: string;
  readonly market: string;
  readonly active: boolean;
};

type StockMasterFile = {
  readonly sourceDate: string;
  readonly stocks: readonly StockMasterEntry[];
};

const master = JSON.parse(
  readFileSync(path.join(process.cwd(), "src/data/stock-master.json"), "utf8"),
) as StockMasterFile;

export const STOCK_MASTER_SOURCE_DATE = master.sourceDate;
export const STOCK_MASTER = master.stocks;

export function activeCommonStocks(
  limit?: number,
): readonly StockMasterEntry[] {
  const active = STOCK_MASTER.filter((stock) => stock.active);
  return limit === undefined ? active : active.slice(0, Math.max(0, limit));
}
