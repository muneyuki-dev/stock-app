"use client";

/**
 * チャートの表示期間切り替えを担当するクライアントコンポーネント。
 *
 * サーバー側では「取得できる全期間」の日足を1回だけ取得しておき（yahoo.ts
 * の lookbackDays: "max"）、期間ボタンを押したときはここでその配列を
 * 切り出すだけにする。ネットワーク通信が発生しないので、ページ全体の
 * 再読み込みなしに即座にチャートだけ更新できる。
 */

import { useMemo, useState } from "react";
import { PriceChart } from "@/components/PriceChart";
import { TechnicalDiagnosisCard } from "@/components/TechnicalDiagnosisCard";
import {
  buildChartViewModel,
  DEFAULT_PERIOD_KEY,
  PERIOD_OPTIONS,
  type PeriodKey,
  periodToDays,
} from "@/lib/chartData";
import {
  aggregateWeeklyCandles,
  analyzeTechnicalSnapshot,
  type Timeframe,
} from "@/lib/technicalAnalysis";
import type { Candle } from "@/lib/types";

export type StockChartSectionProps = {
  /** 取得できた全期間の日足（古い順） */
  readonly candles: readonly Candle[];
};

export function StockChartSection({ candles }: StockChartSectionProps) {
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD_KEY);
  const [timeframe, setTimeframe] = useState<Timeframe>("daily");

  const sourceCandles = useMemo(
    () => (timeframe === "daily" ? candles : aggregateWeeklyCandles(candles)),
    [candles, timeframe],
  );

  const view = useMemo(
    () => buildChartViewModel(sourceCandles, periodToDays(period)),
    [sourceCandles, period],
  );

  const diagnosis = useMemo(
    () =>
      analyzeTechnicalSnapshot(sourceCandles, {
        yearSessions: timeframe === "daily" ? 252 : 52,
      }),
    [sourceCandles, timeframe],
  );

  return (
    <div className="min-w-0 max-w-full overflow-hidden">
      <div className="mb-3 flex items-center gap-2 sm:mb-4">
        <span className="mr-1 text-xs text-slate-500">足種</span>
        {(
          [
            { key: "daily", label: "日足" },
            { key: "weekly", label: "週足" },
          ] as const
        ).map((option) => {
          const active = option.key === timeframe;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setTimeframe(option.key)}
              aria-pressed={active}
              className={
                active
                  ? "min-h-11 rounded-md bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-950"
                  : "min-h-11 rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300"
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <fieldset className="mb-3 flex max-w-full flex-wrap gap-1.5 border-0 p-0 sm:mb-4">
        <legend className="sr-only">表示期間</legend>
        {PERIOD_OPTIONS.map((option) => {
          const active = option.key === period;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setPeriod(option.key)}
              aria-pressed={active}
              className={
                active
                  ? "min-h-11 rounded-full bg-sky-600 px-3 py-1.5 text-sm font-medium text-white"
                  : "min-h-11 rounded-full border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100"
              }
            >
              {option.label}
            </button>
          );
        })}
      </fieldset>

      {view.candles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-700 p-10 text-center text-sm text-slate-500">
          この期間のデータがありません。
        </p>
      ) : (
        <PriceChart
          candles={view.candles}
          timeframe={timeframe}
          indicators={{
            sma5: view.sma5,
            sma25: view.sma25,
            sma75: view.sma75,
            sma200: view.sma200,
          }}
        />
      )}

      <TechnicalDiagnosisCard snapshot={diagnosis} timeframe={timeframe} />
    </div>
  );
}
