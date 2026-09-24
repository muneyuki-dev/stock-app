"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFavorites } from "@/hooks/useFavorites";
import {
  SCREEN_CONDITIONS,
  type ScreenCondition,
  type ScreeningApiResponse,
  type StockScreeningResult,
} from "@/lib/screener";

type MatchMode = "all" | "any";

const CONDITION_DETAILS: Readonly<Record<ScreenCondition, string>> = {
  near75: "終値と75日線の差が±3%以内",
  notExtended75: "終値が75日線の上0〜8%以内",
  cross75: "直近5営業日以内に終値が75日線を上抜け",
  risingMas: "25・75・200日線が5営業日前より上向き",
  volumeSurge: "当日の出来高が直前20営業日平均の1.5倍以上",
  nearYearHigh: "終値が52週高値まで5%以内",
  firstPullback:
    "25/75クロス後に一度8%以上上昇し、初めて75日線の0〜5%上へ戻った直近3営業日",
};

function matches(
  result: StockScreeningResult,
  selected: ReadonlySet<ScreenCondition>,
  mode: MatchMode,
) {
  const values = [...selected].map((condition) => result.conditions[condition]);
  return mode === "all" ? values.every(Boolean) : values.some(Boolean);
}

export function FavoriteScreener() {
  const { favorites, isLoaded } = useFavorites();
  const [selected, setSelected] = useState<Set<ScreenCondition>>(
    new Set(SCREEN_CONDITIONS.map((condition) => condition.key)),
  );
  const [mode, setMode] = useState<MatchMode>("any");
  const [response, setResponse] = useState<ScreeningApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matchesResults = useMemo(() => {
    if (response === null || selected.size === 0) return [];
    return response.results.filter((result) => matches(result, selected, mode));
  }, [response, selected, mode]);

  function toggleCondition(condition: ScreenCondition) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(condition)) next.delete(condition);
      else next.add(condition);
      return next;
    });
  }

  async function runScreening() {
    if (favorites.length === 0 || selected.size === 0) return;
    setIsLoading(true);
    setError(null);

    try {
      const apiResponse = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codes: favorites.map((favorite) => favorite.code),
        }),
      });
      const payload = (await apiResponse.json()) as
        | ScreeningApiResponse
        | { error?: string };
      if (!apiResponse.ok || !("results" in payload)) {
        throw new Error("error" in payload ? payload.error : undefined);
      }
      setResponse(payload);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "検索中にエラーが発生しました。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  if (!isLoaded) return null;

  return (
    <section className="mt-10 border-t border-slate-800 pt-8">
      <h2 className="text-lg font-semibold">お気に入りを条件検索</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        書籍のチェック項目を数値化した学習用の目安です。該当は売買推奨を意味しません。
      </p>

      <fieldset className="mt-5 space-y-3">
        <legend className="text-sm font-medium text-slate-300">検索条件</legend>
        {SCREEN_CONDITIONS.map((condition) => (
          <label
            key={condition.key}
            className="flex cursor-pointer items-start gap-3"
          >
            <input
              type="checkbox"
              checked={selected.has(condition.key)}
              onChange={() => toggleCondition(condition.key)}
              className="mt-0.5 h-4 w-4 accent-sky-500"
            />
            <span>
              <span className="block text-sm text-slate-200">
                {condition.label}
              </span>
              <span className="block text-xs text-slate-500">
                {CONDITION_DETAILS[condition.key]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="mt-5 flex gap-4 text-sm text-slate-300">
        <legend className="sr-only">条件の組み合わせ</legend>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="match-mode"
            checked={mode === "any"}
            onChange={() => setMode("any")}
            className="accent-sky-500"
          />
          どれかを満たす
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="match-mode"
            checked={mode === "all"}
            onChange={() => setMode("all")}
            className="accent-sky-500"
          />
          すべて満たす
        </label>
      </fieldset>

      <button
        type="button"
        onClick={runScreening}
        disabled={favorites.length === 0 || selected.size === 0 || isLoading}
        className="mt-5 w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
      >
        {isLoading
          ? `${favorites.length}銘柄を確認中…`
          : `お気に入り${favorites.length}銘柄を検索`}
      </button>

      {favorites.length === 0 && (
        <p className="mt-3 text-xs text-slate-500">
          検索するには、先に銘柄詳細ページからお気に入りを登録してください。
        </p>
      )}
      {error !== null && (
        <p className="mt-4 rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      {response !== null && !isLoading && (
        <div className="mt-6">
          <p className="text-sm text-slate-400">
            該当{" "}
            <span className="font-semibold text-slate-100">
              {matchesResults.length}
            </span>
            件 / 判定 {response.results.length}件
          </p>
          {matchesResults.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-700 p-5 text-center text-sm text-slate-500">
              選択した条件に該当する銘柄はありませんでした。
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {matchesResults.map((result) => (
                <ScreeningResultCard key={result.code} result={result} />
              ))}
            </ul>
          )}

          {response.failures.length > 0 && (
            <details className="mt-4 text-xs text-amber-300">
              <summary className="cursor-pointer">
                取得・判定できなかった銘柄（{response.failures.length}件）
              </summary>
              <ul className="mt-2 space-y-1 text-amber-400/80">
                {response.failures.map((failure) => (
                  <li key={failure.code}>
                    {failure.code}: {failure.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function ScreeningResultCard({ result }: { result: StockScreeningResult }) {
  return (
    <li className="rounded-lg border border-slate-800 p-4">
      <Link
        href={`/stocks/${result.code}`}
        className="font-medium text-slate-100 hover:text-sky-400"
      >
        <span className="tabular-nums">{result.code}</span>
        {result.name !== null && (
          <span className="ml-2 text-sm">{result.name}</span>
        )}
      </Link>
      <p className="mt-1 text-xs tabular-nums text-slate-500">
        {result.latestDate} 終値 {result.close.toLocaleString("ja-JP")}円 ／
        75日線との差 {result.distanceFrom75Percent >= 0 ? "+" : ""}
        {result.distanceFrom75Percent.toFixed(2)}%
      </p>
      <p className="mt-1 text-xs tabular-nums text-slate-500">
        出来高20日平均比 {result.volumeRatio?.toFixed(2) ?? "—"}倍 ／
        52週高値まで {Math.abs(result.distanceFromYearHighPercent).toFixed(2)}%
      </p>
      <ul className="mt-3 flex flex-wrap gap-2 text-xs">
        {SCREEN_CONDITIONS.map((condition) => (
          <li
            key={condition.key}
            className={
              result.conditions[condition.key]
                ? "rounded-full bg-emerald-950 px-2.5 py-1 text-emerald-300"
                : "rounded-full bg-slate-900 px-2.5 py-1 text-slate-600"
            }
          >
            {result.conditions[condition.key] ? "✓" : "—"} {condition.label}
          </li>
        ))}
      </ul>
      {result.cross75Date !== null && (
        <p className="mt-2 text-xs text-slate-500">
          75日線上抜け日: {result.cross75Date}
        </p>
      )}
      {result.conditions.firstPullback && result.firstPullbackDate !== null && (
        <p className="mt-1 text-xs text-slate-500">
          初押し接近日: {result.firstPullbackDate}
        </p>
      )}
    </li>
  );
}
