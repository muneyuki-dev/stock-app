"use client";

import {
  CandlestickSeries,
  createChart,
  type IChartApi,
  LineSeries,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { MaSeries } from "@/lib/indicators";
import type { Timeframe } from "@/lib/technicalAnalysis";
import type { Candle } from "@/lib/types";

/**
 * 配色は dataviz スキルの検証済みパレットから選定。
 * ローソク足の赤=陽線・青=陰線は日本の相場慣習（状態色）で固定し、
 * 移動平均3本にはそれと被らないカテゴリカル色（aqua/yellow/violet）を
 * 使う。この3色は背景 #020617 に対して
 * `node scripts/validate_palette.js "#199e70,#c98500,#9085e9" --mode dark --surface "#020617"`
 * で全チェック合格を確認済み。
 */
const CHART_COLORS = {
  background: "#020617", // slate-950（layout.tsx の背景色と揃える）
  text: "#94a3b8", // slate-400
  grid: "#1e293b", // slate-800
  border: "#334155", // slate-700
  upCandle: "#e34948", // 陽線（赤）
  downCandle: "#3987e5", // 陰線（青）
  sma5: "#199e70",
  sma25: "#c98500",
  sma75: "#9085e9",
  sma200: "#e66767",
} as const;

const MA_LINES = [
  { key: "sma5", period: 5, color: CHART_COLORS.sma5 },
  { key: "sma25", period: 25, color: CHART_COLORS.sma25 },
  { key: "sma75", period: 75, color: CHART_COLORS.sma75 },
  { key: "sma200", period: 200, color: CHART_COLORS.sma200 },
] as const satisfies readonly {
  key: keyof PriceChartProps["indicators"];
  period: number;
  color: string;
}[];

export type PriceChartProps = {
  readonly candles: readonly Candle[];
  readonly indicators: {
    readonly sma5: MaSeries;
    readonly sma25: MaSeries;
    readonly sma75: MaSeries;
    readonly sma200: MaSeries;
  };
  readonly timeframe?: Timeframe;
};

/** 移動平均の系列を lightweight-charts が読める形に変換する（null は間引く） */
function toLinePoints(candles: readonly Candle[], series: MaSeries) {
  const points: { time: string; value: number }[] = [];

  candles.forEach((candle, i) => {
    const value = series[i];
    if (value !== null) {
      points.push({ time: candle.date, value });
    }
  });

  return points;
}

export function PriceChart({
  candles,
  indicators,
  timeframe = "daily",
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const unit = timeframe === "daily" ? "日" : "週";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const chart: IChartApi = createChart(container, {
      autoSize: true, // 親要素のサイズに追従してリサイズする
      layout: {
        background: { color: CHART_COLORS.background },
        textColor: CHART_COLORS.text,
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid },
        horzLines: { color: CHART_COLORS.grid },
      },
      rightPriceScale: { borderColor: CHART_COLORS.border },
      timeScale: { borderColor: CHART_COLORS.border },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.upCandle,
      downColor: CHART_COLORS.downCandle,
      borderUpColor: CHART_COLORS.upCandle,
      borderDownColor: CHART_COLORS.downCandle,
      wickUpColor: CHART_COLORS.upCandle,
      wickDownColor: CHART_COLORS.downCandle,
    });
    candleSeries.setData(
      candles.map((candle) => ({
        time: candle.date,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    );

    for (const { key, period, color } of MA_LINES) {
      const label = `${period}${unit}線`;
      const line = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        title: label, // 価格軸の右端に系列名つきの直接ラベルを出す
        priceLineVisible: false,
        crosshairMarkerVisible: true,
      });
      line.setData(toLinePoints(candles, indicators[key]));
    }

    chart.timeScale().fitContent();

    // HMRでの再マウントやページ遷移でチャートが残り続けないようにする
    return () => {
      chart.remove();
    };
  }, [candles, indicators, unit]);

  return (
    <div className="min-w-0 max-w-full overflow-hidden">
      {/* 凡例。色だけに頼らず、系列名を文字でも示す */}
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-2 text-xs text-slate-400 sm:gap-4">
        {MA_LINES.map(({ key, period, color }) => (
          <span key={key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {period}
            {unit}線
          </span>
        ))}
      </div>

      <div
        ref={containerRef}
        className="h-[320px] min-w-0 max-w-full sm:h-[420px]"
      />
    </div>
  );
}
