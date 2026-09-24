/**
 * 実データで株価取得と指標計算を確認するスクリプト。
 *
 *   npm run check          … 7203（トヨタ）で確認
 *   npm run check 6758     … 銘柄コードを指定
 *
 * 画面を作る前に、ここでデータが正しく取れているか確かめる。
 */

import {
  analyzeMovingAverages,
  type CrossSignal,
} from "../src/lib/indicators.ts";
import {
  fetchDailyCandles,
  MIN_BARS_FOR_MID_TERM_CROSS,
} from "../src/lib/yahoo.ts";

const code = process.argv[2] ?? "7203";

/** 株価を「1,234.5」の形に整える */
const price = (value: number) =>
  value.toLocaleString("ja-JP", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

/** 移動平均の値。助走期間中は「未確定」と表示する */
const ma = (value: number | null) =>
  (value === null ? "未確定" : price(value)).padStart(10);

const crossLabel = (signal: CrossSignal) =>
  signal.type === "golden" ? "ゴールデンクロス" : "デッドクロス";

console.log(`\n${code} を取得中...\n`);

const result = await fetchDailyCandles(code);

if (!result.ok) {
  console.error(`✗ ${result.error}`);
  process.exit(1);
}

const { name, symbol, currency, marketPrice, marketTime, candles } =
  result.value;
const analysis = analyzeMovingAverages(candles);

// --- 取得したデータの概要 ---------------------------------------------------
console.log("=== 取得データ ===");
console.log(`  銘柄        : ${name ?? "(名称不明)"}（${symbol}）`);
console.log(`  現在値      : ${price(marketPrice)} ${currency}`);
console.log(`  株価の時刻  : ${marketTime.toLocaleString("ja-JP")}`);
console.log(`  取得本数    : ${candles.length} 本`);
console.log(
  `  期間        : ${candles[0].date} 〜 ${candles[candles.length - 1].date}`,
);

if (candles.length < MIN_BARS_FOR_MID_TERM_CROSS) {
  console.log(
    `  ⚠ 25日/75日の判定には ${MIN_BARS_FOR_MID_TERM_CROSS} 本以上必要です`,
  );
}

// --- 直近5営業日の終値と移動平均 -------------------------------------------
console.log("\n=== 直近5営業日 ===");
console.log("  日付            終値       5日線      25日線      75日線");

for (let i = Math.max(0, candles.length - 5); i < candles.length; i++) {
  const candle = candles[i];
  console.log(
    `  ${candle.date}  ${price(candle.close).padStart(9)} ${ma(analysis.sma5[i])} ${ma(analysis.sma25[i])} ${ma(analysis.sma75[i])}`,
  );
}

// --- 最新値のまとめ ---------------------------------------------------------
const last = candles.length - 1;
console.log("\n=== 最新値 ===");
console.log(`  日付        : ${candles[last].date}`);
console.log(`  終値        : ${price(candles[last].close)}`);
console.log(`  出来高      : ${candles[last].volume.toLocaleString("ja-JP")}`);
console.log(`  5日移動平均 : ${ma(analysis.sma5[last]).trim()}`);
console.log(`  25日移動平均: ${ma(analysis.sma25[last]).trim()}`);
console.log(`  75日移動平均: ${ma(analysis.sma75[last]).trim()}`);

// --- クロス判定 -------------------------------------------------------------
console.log("\n=== 直近のクロス ===");

for (const pair of ["5/25", "25/75"] as const) {
  const signal = analysis.latest[pair];

  if (signal === null) {
    console.log(`  ${pair.padEnd(6)}: この期間では検出なし`);
    continue;
  }

  const mark = signal.type === "golden" ? "▲" : "▼";
  console.log(
    `  ${pair.padEnd(6)}: ${mark} ${crossLabel(signal)}  ${signal.date}（${signal.daysAgo}営業日前）`,
  );
}

// --- 発生履歴 ---------------------------------------------------------------
console.log(`\n=== クロスの履歴（${analysis.history.length}件）===`);

if (analysis.history.length === 0) {
  console.log("  なし");
} else {
  for (const signal of analysis.history) {
    const mark = signal.type === "golden" ? "▲" : "▼";
    console.log(
      `  ${signal.date}  ${mark} ${signal.pair.padEnd(6)} ${crossLabel(signal)}`,
    );
  }
}

console.log();
