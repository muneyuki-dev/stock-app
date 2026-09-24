"use client";

import { useState } from "react";
import { useFavorites } from "@/hooks/useFavorites";

export type FavoriteButtonProps = {
  readonly code: string;
  readonly name: string | null;
};

export function FavoriteButton({ code, name }: FavoriteButtonProps) {
  const { isLoaded, isFavorite, add, remove } = useFavorites();
  const [error, setError] = useState<string | null>(null);

  // localStorage の読み込みが終わるまでは登録状態を判定できないため、
  // クリックできない見た目にしておく（誤操作防止）
  if (!isLoaded) {
    return (
      <button
        type="button"
        disabled
        className="min-h-11 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-500"
      >
        ☆ お気に入り
      </button>
    );
  }

  const active = isFavorite(code);

  function handleClick() {
    if (active) {
      remove(code);
      setError(null);
      return;
    }

    const result = add({ code, name });
    setError(result.ok ? null : result.error);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={active}
        className={
          active
            ? "min-h-11 rounded-lg border border-amber-500 bg-amber-500/10 px-4 py-2 text-sm text-amber-400 transition-colors hover:bg-amber-500/20"
            : "min-h-11 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100"
        }
      >
        {active ? "★ お気に入り解除" : "☆ お気に入りに追加"}
      </button>

      {error !== null && <p className="mt-2 text-sm text-rose-400">{error}</p>}
    </div>
  );
}
