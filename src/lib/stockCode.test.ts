import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStockCode } from "./stockCode.ts";

describe("銘柄検索の入力", () => {
  it("数字・全角・Yahooシンボルを同じ東証コードへ正規化する", () => {
    for (const input of ["7203", "７２０３", "7203.T", " 7203.t "]) {
      assert.deepEqual(parseStockCode(input), {
        ok: true,
        value: { code: "7203", symbol: "7203.T" },
      });
    }
  });
  it("英字を含む証券コードも受け付ける", () => {
    assert.deepEqual(parseStockCode("130a"), {
      ok: true,
      value: { code: "130A", symbol: "130A.T" },
    });
  });
  it("空欄・銘柄名・他市場・URLを詳細画面へ渡さない", () => {
    for (const input of [
      "",
      "720",
      "トヨタ",
      "7203.N",
      "javascript:alert(1)",
      "../7203",
    ]) {
      assert.equal(parseStockCode(input).ok, false);
    }
  });
});
