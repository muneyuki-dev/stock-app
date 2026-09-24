/**
 * お気に入りロジックのテスト。localStorage やDOMを使わない純関数のみを対象にする。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addFavorite,
  type FavoriteStock,
  isFavorite,
  MAX_FAVORITES,
  parseStoredFavorites,
  removeFavorite,
  serializeFavorites,
  sortByRecency,
} from "./favorites.ts";

/** テスト用にN件のダミーお気に入りを作る（addedAtは1分ずつずらす） */
function makeFavorites(count: number): FavoriteStock[] {
  return Array.from({ length: count }, (_, i) => ({
    code: String(1000 + i).padStart(4, "0"),
    name: `テスト銘柄${i}`,
    addedAt: new Date(2026, 0, 1, 0, i).toISOString(),
  }));
}

describe("isFavorite", () => {
  it("登録済みなら true", () => {
    const list = makeFavorites(3);
    assert.equal(isFavorite(list, list[1].code), true);
  });

  it("未登録なら false", () => {
    assert.equal(isFavorite(makeFavorites(3), "9999"), false);
  });

  it("空リストなら常に false", () => {
    assert.equal(isFavorite([], "7203"), false);
  });
});

describe("addFavorite", () => {
  it("新しい銘柄を追加できる", () => {
    const result = addFavorite([], { code: "7203", name: "トヨタ自動車" });

    assert.ok(result.ok);
    assert.equal(result.value.length, 1);
    assert.equal(result.value[0].code, "7203");
    assert.equal(result.value[0].name, "トヨタ自動車");
  });

  it("同じコードを2回追加しても重複登録しない", () => {
    const first = addFavorite([], { code: "7203", name: "トヨタ自動車" });
    assert.ok(first.ok);

    const second = addFavorite(first.value, {
      code: "7203",
      name: "トヨタ自動車",
    });

    assert.ok(second.ok);
    assert.equal(second.value.length, 1);
  });

  it("49件のときはまだ追加できる（境界値）", () => {
    const list = makeFavorites(MAX_FAVORITES - 1);
    const result = addFavorite(list, { code: "9999", name: null });

    assert.ok(result.ok);
    assert.equal(result.value.length, MAX_FAVORITES);
  });

  it("50件（上限）のときは追加できずエラーを返す", () => {
    const list = makeFavorites(MAX_FAVORITES);
    const result = addFavorite(list, { code: "9999", name: null });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /50/);
    }
  });

  it("50件でも既に登録済みのコードなら重複エラーにならない", () => {
    const list = makeFavorites(MAX_FAVORITES);
    const result = addFavorite(list, { code: list[0].code, name: null });

    assert.ok(result.ok);
    assert.equal(result.value.length, MAX_FAVORITES);
  });

  it("名前がnullでも追加できる", () => {
    const result = addFavorite([], { code: "7203", name: null });

    assert.ok(result.ok);
    assert.equal(result.value[0].name, null);
  });
});

describe("removeFavorite", () => {
  it("指定したコードを取り除く", () => {
    const list = makeFavorites(3);
    const result = removeFavorite(list, list[1].code);

    assert.equal(result.length, 2);
    assert.ok(!result.some((f) => f.code === list[1].code));
  });

  it("存在しないコードを指定しても変化しない", () => {
    const list = makeFavorites(3);
    const result = removeFavorite(list, "9999");

    assert.equal(result.length, 3);
  });

  it("空リストから削除しても落ちない", () => {
    assert.deepEqual(removeFavorite([], "7203"), []);
  });
});

describe("sortByRecency", () => {
  it("追加日時が新しい順に並ぶ", () => {
    const list = makeFavorites(3); // addedAt は 0分, 1分, 2分 の順
    const sorted = sortByRecency(list);

    assert.deepEqual(
      sorted.map((f) => f.code),
      [list[2].code, list[1].code, list[0].code],
    );
  });

  it("元の配列を書き換えない（純関数であること）", () => {
    const list = makeFavorites(3);
    const original = [...list];
    sortByRecency(list);

    assert.deepEqual(list, original);
  });
});

describe("serializeFavorites / parseStoredFavorites（往復）", () => {
  it("保存した内容をそのまま復元できる", () => {
    const list = makeFavorites(2);
    const restored = parseStoredFavorites(serializeFavorites(list));

    assert.deepEqual(restored, list);
  });

  it("null（未保存の状態）は空配列になる", () => {
    assert.deepEqual(parseStoredFavorites(null), []);
  });

  it("壊れたJSONは空配列になる（例外を投げない）", () => {
    assert.deepEqual(parseStoredFavorites("{not valid json"), []);
  });

  it("配列以外の値は空配列になる", () => {
    assert.deepEqual(parseStoredFavorites('{"code":"7203"}'), []);
  });

  it("形が不正な要素だけを取り除く", () => {
    const raw = JSON.stringify([
      { code: "7203", name: "トヨタ自動車", addedAt: "2026-01-01T00:00:00Z" },
      { code: "abc", name: "不正なコード", addedAt: "2026-01-01T00:00:00Z" }, // コード形式が不正
      { code: "6758" }, // addedAt が欠けている
      "not an object",
      null,
    ]);

    const restored = parseStoredFavorites(raw);

    assert.equal(restored.length, 1);
    assert.equal(restored[0].code, "7203");
  });
});
