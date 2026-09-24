/**
 * お気に入り銘柄のロジック（純関数のみ）。
 *
 * このファイルは localStorage や DOM に触らない。読み書きは
 * `hooks/useFavorites.ts` が担当し、ここでは「重複させない」
 * 「上限を超えない」といったルールだけを扱う。ブラウザなしで
 * テストできるようにするための分離。
 */

import { parseStockCode } from "./stockCode.ts";
import type { Result } from "./types.ts";

/** 登録できるお気に入りの最大件数 */
export const MAX_FAVORITES = 50;

export type FavoriteStock = {
  /** 正規化された銘柄コード（例: "7203"） */
  readonly code: string;
  /** 追加した時点の銘柄名（取得できていなければ null） */
  readonly name: string | null;
  /** 追加した日時（ISO文字列）。並び替えに使う */
  readonly addedAt: string;
};

/** 指定したコードがすでにお気に入りに入っているか */
export function isFavorite(
  list: readonly FavoriteStock[],
  code: string,
): boolean {
  return list.some((favorite) => favorite.code === code);
}

/**
 * お気に入りを追加する。
 *
 * - すでに登録済みなら何もせず、現在のリストをそのまま返す（重複登録しない）
 * - 上限（50件）に達している場合はエラーを返す
 */
export function addFavorite(
  list: readonly FavoriteStock[],
  entry: { readonly code: string; readonly name: string | null },
): Result<FavoriteStock[]> {
  if (isFavorite(list, entry.code)) {
    return { ok: true, value: [...list] };
  }

  if (list.length >= MAX_FAVORITES) {
    return {
      ok: false,
      error: `お気に入りは最大${MAX_FAVORITES}件までです。他の銘柄を解除してから追加してください。`,
    };
  }

  return {
    ok: true,
    value: [
      ...list,
      { code: entry.code, name: entry.name, addedAt: new Date().toISOString() },
    ],
  };
}

/** お気に入りから取り除く（存在しないコードを渡しても何も起きない） */
export function removeFavorite(
  list: readonly FavoriteStock[],
  code: string,
): FavoriteStock[] {
  return list.filter((favorite) => favorite.code !== code);
}

/** 一覧表示用に、追加した日時が新しい順に並べ替える */
export function sortByRecency(list: readonly FavoriteStock[]): FavoriteStock[] {
  return [...list].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

/** localStorage に保存する形（JSON文字列）に変換する */
export function serializeFavorites(list: readonly FavoriteStock[]): string {
  return JSON.stringify(list);
}

/** JSONの値が正しい FavoriteStock の形をしているか確認する */
function isFavoriteStock(value: unknown): value is FavoriteStock {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.code === "string" &&
    parseStockCode(record.code).ok &&
    (typeof record.name === "string" || record.name === null) &&
    typeof record.addedAt === "string"
  );
}

/**
 * localStorage から読み込んだ文字列を安全にパースする。
 *
 * 保存前のバージョンのデータ、手動での書き換え、破損したJSONなど、
 * 想定外の内容が入っていても例外を投げずに空配列を返す。
 */
export function parseStoredFavorites(raw: string | null): FavoriteStock[] {
  if (raw === null) {
    return [];
  }

  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) {
      return [];
    }
    return data.filter(isFavoriteStock);
  } catch {
    return [];
  }
}
