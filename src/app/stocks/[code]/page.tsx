import Link from "next/link";
import { notFound } from "next/navigation";
import { FavoriteButton } from "@/components/FavoriteButton";
import { LogoutButton } from "@/components/LogoutButton";
import { StockChartSection } from "@/components/StockChartSection";
import { analyzeMovingAverages, type CrossSignal } from "@/lib/indicators";
import { parseStockCode } from "@/lib/stockCode";
import { fetchDailyCandles, type StockChartData } from "@/lib/yahoo";

export default async function StockPage(props: PageProps<"/stocks/[code]">) {
  // Next.js 16 では params は Promise なので await して取り出す
  const { code } = await props.params;

  const parsed = parseStockCode(code);
  if (!parsed.ok) {
    notFound();
  }

  // yahoo-finance2 はサーバー側専用のため、この Server Component で取得する。
  // 期間選択（3か月〜最大）をページ再読み込みなしで切り替えられるように、
  // ここで取得できる全期間を1回だけ取得しておき、期間の切り替えは
  // クライアント側（StockChartSection）で配列を切り出すだけにする。
  const result = await fetchDailyCandles(parsed.value.code, {
    lookbackDays: "max",
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-10">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm text-slate-400 transition-colors hover:text-slate-200"
        >
          ← 銘柄検索・お気に入りへ
        </Link>
        <LogoutButton />
      </div>

      {!result.ok ? (
        <>
          <h1 className="mt-4 text-2xl font-bold tabular-nums">
            {parsed.value.code}
          </h1>
          <p
            role="alert"
            className="mt-8 rounded-lg border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-300"
          >
            {result.error}
          </p>
        </>
      ) : (
        <StockDetail data={result.value} />
      )}
    </main>
  );
}

function StockDetail({ data }: { data: StockChartData }) {
  // クロス判定は表示期間に関係なく「取得できた全期間」から見た
  // 直近の状態を示すので、期間選択とは独立にここで一度だけ計算する
  const { latest } = analyzeMovingAverages(data.candles);
  const latestCandle = data.candles[data.candles.length - 1];

  return (
    <>
      <div className="mt-3 min-w-0 sm:mt-4">
        <h1 className="break-words text-2xl font-bold leading-tight">
          {data.name ?? data.code}
          <span className="ml-2 inline-block text-sm font-normal tabular-nums text-slate-500 sm:ml-3 sm:text-base">
            {data.symbol}
          </span>
        </h1>

        <p className="mt-3 text-3xl font-semibold tabular-nums sm:text-2xl">
          {data.marketPrice.toLocaleString("ja-JP", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}
          <span className="ml-1 text-sm font-normal text-slate-500">
            {data.currency}
          </span>
        </p>

        <p className="mt-1 text-xs text-slate-500">
          {data.marketTime.toLocaleString("ja-JP")} 時点（約20分遅延）
        </p>

        <div className="mt-3">
          <FavoriteButton code={data.code} name={data.name} />
        </div>
      </div>

      {latestCandle && (
        <section className="mt-5" aria-label="最新日足の価格と出来高">
          <h2 className="mb-2 text-sm text-slate-400">
            最新日足（{latestCandle.date}）
          </h2>
          <dl className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800 p-3 text-sm sm:grid-cols-5">
            {(
              [
                ["始値", latestCandle.open, data.currency],
                ["高値", latestCandle.high, data.currency],
                ["安値", latestCandle.low, data.currency],
                ["終値", latestCandle.close, data.currency],
                ["出来高", latestCandle.volume, "株"],
              ] as const
            ).map(([label, value, unit]) => (
              <div key={label} className="min-w-0">
                <dt className="text-slate-400">{label}</dt>
                <dd className="break-words tabular-nums">
                  {value.toLocaleString("ja-JP")}{" "}
                  <span className="text-xs text-slate-500">{unit}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-slate-500">
            取引時間中の最新日足は未確定です。
          </p>
        </section>
      )}

      <div className="mt-5 sm:mt-6">
        <StockChartSection candles={data.candles} />
      </div>

      <dl className="mt-6 grid gap-2 text-sm sm:grid-cols-2">
        <CrossRow pair="5/25" signal={latest["5/25"]} />
        <CrossRow pair="25/75" signal={latest["25/75"]} />
      </dl>
    </>
  );
}

function CrossRow({
  pair,
  signal,
}: {
  pair: "5/25" | "25/75";
  signal: CrossSignal | null;
}) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1 rounded-lg border border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <dt className="text-slate-400">{pair} 日線クロス</dt>
      <dd className="min-w-0 break-words tabular-nums sm:text-right">
        {signal === null ? (
          <span className="text-slate-500">検出なし</span>
        ) : (
          <span
            className={
              signal.type === "golden" ? "text-rose-400" : "text-sky-400"
            }
          >
            {signal.type === "golden" ? "▲ ゴールデンクロス" : "▼ デッドクロス"}
            <span className="ml-2 inline-block text-slate-500">
              {signal.date}（{signal.daysAgo}営業日前）
            </span>
          </span>
        )}
      </dd>
    </div>
  );
}
