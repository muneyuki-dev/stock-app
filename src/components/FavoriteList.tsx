"use client";

import Link from "next/link";
import { useFavorites } from "@/hooks/useFavorites";

export function FavoriteList() {
  const { favorites, isLoaded, remove, count, max } = useFavorites();

  // 読み込み前は何も描画しない（「お気に入りなし」の一瞬の表示を避ける）
  if (!isLoaded) {
    return null;
  }

  if (favorites.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        お気に入りはまだありません。銘柄コードを入力して、詳細ページの「☆
        お気に入りに追加」から登録できます。
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-slate-300">お気に入り</h2>
        <span className="text-xs tabular-nums text-slate-500">
          {count} / {max}
        </span>
      </div>

      <ul className="mt-2 divide-y divide-slate-800 rounded-lg border border-slate-800">
        {favorites.map((favorite) => (
          <li
            key={favorite.code}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <Link
              href={`/stocks/${favorite.code}`}
              className="min-w-0 flex-1 truncate transition-colors hover:text-sky-400"
            >
              <span className="font-medium tabular-nums">{favorite.code}</span>
              {favorite.name !== null && (
                <span className="ml-2 text-sm text-slate-500">
                  {favorite.name}
                </span>
              )}
            </Link>

            <button
              type="button"
              onClick={() => remove(favorite.code)}
              aria-label={`${favorite.code} をお気に入りから削除`}
              className="flex size-11 shrink-0 items-center justify-center rounded text-lg text-slate-500 transition-colors hover:bg-slate-900 hover:text-rose-400"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
