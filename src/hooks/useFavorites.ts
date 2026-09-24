"use client";

/**
 * お気に入りの読み書きを localStorage で行うフック。
 *
 * ルール自体（重複禁止・50件上限）は lib/favorites.ts の純関数に
 * 任せて、このファイルは「ブラウザに保存する」ことだけを担当する。
 */

import { useCallback, useEffect, useState } from "react";
import {
  addFavorite,
  type FavoriteStock,
  isFavorite as isFavoriteCode,
  MAX_FAVORITES,
  parseStoredFavorites,
  removeFavorite,
  serializeFavorites,
  sortByRecency,
} from "@/lib/favorites";
import type { Result } from "@/lib/types";

const STORAGE_KEY = "stock-app:favorites";

function readFromStorage(): FavoriteStock[] {
  // サーバーサイドレンダリング中は window が存在しない
  if (typeof window === "undefined") {
    return [];
  }
  return parseStoredFavorites(window.localStorage.getItem(STORAGE_KEY));
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteStock[]>([]);
  // 初回読み込みが終わるまでは「お気に入りなし」と「未確認」を区別する。
  // これがないと、サーバー側でレンダリングした直後に空の状態が一瞬
  // 表示されてしまい、実際にお気に入りがある場合にちらつく。
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setFavorites(readFromStorage());
    setIsLoaded(true);
  }, []);

  // 別のタブ・ウィンドウで変更された場合に反映する
  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        setFavorites(readFromStorage());
      }
    }

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const persist = useCallback((next: FavoriteStock[]) => {
    setFavorites(next);
    window.localStorage.setItem(STORAGE_KEY, serializeFavorites(next));
  }, []);

  const add = useCallback(
    (entry: { code: string; name: string | null }): Result<FavoriteStock[]> => {
      const result = addFavorite(favorites, entry);
      if (result.ok) {
        persist(result.value);
      }
      return result;
    },
    [favorites, persist],
  );

  const remove = useCallback(
    (code: string) => {
      persist(removeFavorite(favorites, code));
    },
    [favorites, persist],
  );

  return {
    /** 追加日時が新しい順のお気に入り一覧 */
    favorites: sortByRecency(favorites),
    /** localStorage からの読み込みが完了したか */
    isLoaded,
    isFavorite: useCallback(
      (code: string) => isFavoriteCode(favorites, code),
      [favorites],
    ),
    add,
    remove,
    count: favorites.length,
    max: MAX_FAVORITES,
  };
}
