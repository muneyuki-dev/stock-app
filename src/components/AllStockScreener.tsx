"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SCREEN_CONDITIONS, type ScreenCondition } from "@/lib/screener";
import type {
  AllStockScreeningStatus,
  SavedScreeningResult,
} from "@/lib/screeningPersistence";

const japaneseDateTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string | null | undefined): string {
  return value ? japaneseDateTime.format(new Date(value)) : "—";
}

export function AllStockScreener() {
  const [status, setStatus] = useState<AllStockScreeningStatus | null>(null);
  const [results, setResults] = useState<readonly SavedScreeningResult[]>([]);
  const [minimumMatches, setMinimumMatches] = useState(1);
  const [required, setRequired] = useState<Set<ScreenCondition>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/screen/all", { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as {
      status: AllStockScreeningStatus | null;
    };
    setStatus(payload.status);
    if (payload.status?.state === "completed") {
      const resultResponse = await fetch("/api/screen/all/results", {
        cache: "no-store",
      });
      if (resultResponse.ok) {
        const resultPayload = (await resultResponse.json()) as {
          results: readonly SavedScreeningResult[];
        };
        setResults(resultPayload.results);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (status?.state !== "running") return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [status?.state, refresh]);

  async function start(reset: boolean) {
    setError(null);
    const response = await fetch("/api/screen/all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        minimumMatches,
        requiredConditions: [...required],
        reset,
      }),
    });
    const payload = (await response.json()) as {
      status?: AllStockScreeningStatus;
      error?: string;
    };
    if (!response.ok || !payload.status) {
      setError(payload.error ?? "開始できませんでした。");
      return;
    }
    setStatus(payload.status);
    setResults([]);
  }

  const progress =
    status === null || status.total === 0
      ? 0
      : Math.round((status.processed / status.total) * 100);
  return (
    <section className="mt-10 border-t border-slate-800 pt-8">
      <h2 className="text-lg font-semibold">全銘柄スクリーニング</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        JPXの普通株マスタ全体を50銘柄ずつ処理します。ブラウザを閉じてもサーバー側で継続します。
      </p>
      <label className="mt-4 block text-sm font-medium text-slate-300">
        一致条件数
        <select
          value={minimumMatches}
          onChange={(event) => setMinimumMatches(Number(event.target.value))}
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-slate-100"
        >
          {SCREEN_CONDITIONS.map((condition, index) => (
            <option key={condition.key} value={index + 1}>
              7条件中 {index + 1}個以上
            </option>
          ))}
        </select>
      </label>
      <p className="mt-4 text-sm font-medium text-slate-300">
        必須条件（任意）
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {SCREEN_CONDITIONS.map((condition) => (
          <label
            key={condition.key}
            className="flex min-h-11 items-center gap-2 text-sm text-slate-300"
          >
            <input
              type="checkbox"
              checked={required.has(condition.key)}
              onChange={() =>
                setRequired((current) => {
                  const next = new Set(current);
                  next.has(condition.key)
                    ? next.delete(condition.key)
                    : next.add(condition.key);
                  return next;
                })
              }
              className="h-4 w-4 accent-sky-500"
            />
            {condition.label}
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={status?.state === "running"}
        onClick={() => void start(status !== null)}
        className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white disabled:bg-slate-800 disabled:text-slate-500"
      >
        {status?.state === "running"
          ? "全銘柄を処理中…"
          : status === null
            ? "全銘柄スクリーニング開始"
            : "新しく全件実行"}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {error}
        </p>
      )}
      {status && (
        <div className="mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-indigo-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-sm tabular-nums text-slate-300">
            処理済み {status.processed.toLocaleString("ja-JP")} /{" "}
            {status.total.toLocaleString("ja-JP")}（{progress}%）
          </p>
          <p className="mt-1 text-xs text-slate-500">
            状態: {status.state === "running" ? "処理中" : "完了"} ／ 一致{" "}
            {status.matched}件 ／ 失敗 {status.failed}件
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Yahoo取得 {status.yahooRequests}回 ／ キャッシュ {status.cacheHits}
            件
          </p>
          {status.dateSummary && (
            <div className="mt-4 rounded-lg border border-slate-800 p-3 text-xs text-slate-400">
              <p>
                データ基準日: {status.dateSummary.primaryDate ?? "—"} ／
                同一基準日{" "}
                {status.dateSummary.primaryDateCount.toLocaleString("ja-JP")} /{" "}
                {status.total.toLocaleString("ja-JP")}
              </p>
              <p className="mt-1">
                古いデータ: {status.dateSummary.staleDateCount}件 ／ 判定不能:{" "}
                {status.dateSummary.indeterminateCount}件 ／ 最古:{" "}
                {status.dateSummary.oldestDate ?? "—"}
              </p>
              <p className="mt-1">
                データ取得日時:{" "}
                {formatDateTime(status.dateSummary.fetchedAtMin)}
                {status.dateSummary.fetchedAtMin !==
                  status.dateSummary.fetchedAtMax &&
                  ` 〜 ${formatDateTime(status.dateSummary.fetchedAtMax)}`}
              </p>
              <p className="mt-1">
                スクリーニング実行日時: {formatDateTime(status.startedAt)}
                {status.completedAt &&
                  ` 〜 ${formatDateTime(status.completedAt)}`}
              </p>
              {status.dateSummary.staleStocks.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-amber-300">
                    古い基準日の銘柄を確認（
                    {status.dateSummary.staleStocks.length}件）
                  </summary>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {status.dateSummary.staleStocks.map((stock) => (
                      <li key={stock.code}>
                        {stock.code}: {stock.latestDate}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          {status.conditionHits && (
            <ul className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
              {SCREEN_CONDITIONS.map((condition) => (
                <li key={condition.key}>
                  {condition.label}: {status.conditionHits[condition.key]}件
                </li>
              ))}
              <li>いずれか一致: {status.anyMatched ?? 0}件</li>
              <li>全条件一致: {status.allMatched ?? 0}件</li>
            </ul>
          )}
          {results.length > 0 && (
            <ul className="mt-4 space-y-2">
              {results.slice(0, 200).map((result) => (
                <li
                  key={result.code}
                  className="rounded-lg border border-slate-800 p-3"
                >
                  <Link
                    href={`/stocks/${result.code}`}
                    className="font-medium text-sky-300"
                  >
                    {result.code} {result.name}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">
                    データ基準日 {result.latestDate} ／ 終値{" "}
                    {result.close.toLocaleString("ja-JP")}円 ／ 出来高{" "}
                    {result.volume.toLocaleString("ja-JP")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    データ取得日時 {formatDateTime(result.fetchedAt)} ／
                    判定日時 {formatDateTime(result.screenedAt)}
                  </p>
                  <p className="mt-2 text-sm font-medium text-emerald-300">
                    一致 {result.matchCount} / {result.totalConditions}（
                    {Math.round(result.matchRate * 100)}%）
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    一致条件: {result.matchedConditionNames.join("・")}
                  </p>
                  <p className="mt-1 text-xs text-emerald-300">
                    {result.matchedReasons.join("・")}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {results.length > 200 && (
            <p className="mt-3 text-xs text-slate-500">
              先頭200件を表示しています。
            </p>
          )}
        </div>
      )}
    </section>
  );
}
