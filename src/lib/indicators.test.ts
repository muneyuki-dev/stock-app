/**
 * 指標計算のテスト。
 * Node.js 24 に標準搭載のテストランナーで動くので、追加ライブラリは不要。
 *
 *   npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeMovingAverages,
  type CrossSignal,
  detectCrosses,
  isRecentGoldenCross,
  type MaSeries,
  sma,
} from "./indicators.ts";
import type { PriceBar } from "./types.ts";

// ---------------------------------------------------------------------------
// テスト用のヘルパー
// ---------------------------------------------------------------------------

/** 小数の誤差を許容して比較する（浮動小数点の計算誤差を考慮） */
function approx(actual: number | null, expected: number, label: string): void {
  assert.ok(
    actual !== null && Math.abs(actual - expected) < 1e-9,
    `${label}: 期待 ${expected} / 実際 ${actual}`,
  );
}

/** 移動平均の系列をまとめて比較する */
function assertSeries(
  actual: MaSeries,
  expected: readonly (number | null)[],
): void {
  assert.equal(actual.length, expected.length, "配列の長さが違う");

  expected.forEach((value, i) => {
    if (value === null) {
      assert.equal(actual[i], null, `${i} 番目は null であるべき`);
    } else {
      approx(actual[i], value, `${i} 番目`);
    }
  });
}

/** 終値の配列から日足データを作る（日付は連番） */
function makeBars(closes: readonly number[]): PriceBar[] {
  const start = Date.UTC(2026, 0, 1);

  return closes.map((close, i) => ({
    date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    close,
  }));
}

// ---------------------------------------------------------------------------
// 移動平均
// ---------------------------------------------------------------------------

describe("sma（単純移動平均）", () => {
  it("3日平均を正しく計算し、助走期間は null になる", () => {
    // [1,2,3] の平均=2、[2,3,4]=3、[3,4,5]=4
    assertSeries(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  });

  it("5日平均を手計算どおりに計算する", () => {
    // (100+102+104+106+108)/5 = 104、(102+104+106+108+110)/5 = 106
    assertSeries(sma([100, 102, 104, 106, 108, 110], 5), [
      null,
      null,
      null,
      null,
      104,
      106,
    ]);
  });

  it("期間1なら元の値と同じになる", () => {
    assertSeries(sma([10, 20, 30], 1), [10, 20, 30]);
  });

  it("データが期間より短いときは全部 null", () => {
    assertSeries(sma([1, 2, 3], 5), [null, null, null]);
  });

  it("ちょうど期間ぶんのデータなら最後の1つだけ値が入る", () => {
    assertSeries(sma([1, 2, 3, 4, 5], 5), [null, null, null, null, 3]);
  });

  it("空の配列なら空の配列を返す", () => {
    assertSeries(sma([], 5), []);
  });

  it("マイナスの値も扱える", () => {
    assertSeries(sma([-2, 0, 2], 3), [null, null, 0]);
  });

  it("引数の配列を書き換えない（純関数であること）", () => {
    const input = [1, 2, 3, 4, 5];
    sma(input, 3);
    assert.deepEqual(input, [1, 2, 3, 4, 5]);
  });

  it("期間が不正なら例外を投げる", () => {
    assert.throws(() => sma([1, 2, 3], 0), RangeError);
    assert.throws(() => sma([1, 2, 3], -1), RangeError);
    assert.throws(() => sma([1, 2, 3], 1.5), RangeError);
  });
});

// ---------------------------------------------------------------------------
// クロス判定
// ---------------------------------------------------------------------------

describe("detectCrosses（クロス判定）", () => {
  it("短期線が長期線を下から上に抜けたらゴールデンクロス", () => {
    // 短期 3 → 4 で、長期 3 をちょうど同値から上抜けする
    const short = [1, 2, 3, 4];
    const long = [3, 3, 3, 3];

    assert.deepEqual(detectCrosses(short, long), [
      { type: "golden", index: 3 },
    ]);
  });

  it("短期線が長期線を上から下に抜けたらデッドクロス", () => {
    const short = [4, 3, 2, 1];
    const long = [3, 3, 3, 3];

    assert.deepEqual(detectCrosses(short, long), [{ type: "dead", index: 2 }]);
  });

  it("同値のまま推移している間はクロスと判定しない", () => {
    assert.deepEqual(detectCrosses([3, 3, 3], [3, 3, 3]), []);
  });

  it("交差していなければ何も検出しない", () => {
    assert.deepEqual(detectCrosses([1, 1, 1], [3, 3, 3]), []);
  });

  it("助走期間（null）を含む区間は判定しない", () => {
    const short = [null, null, 1, 4];
    const long = [null, null, 3, 3];

    assert.deepEqual(detectCrosses(short, long), [
      { type: "golden", index: 3 },
    ]);
  });

  it("片方だけ null の区間も判定しない", () => {
    assert.deepEqual(detectCrosses([1, 4], [null, 3]), []);
  });

  it("上下を繰り返すと発生順に複数検出する", () => {
    const short = [1, 4, 1, 4];
    const long = [3, 3, 3, 3];

    assert.deepEqual(detectCrosses(short, long), [
      { type: "golden", index: 1 },
      { type: "dead", index: 2 },
      { type: "golden", index: 3 },
    ]);
  });

  it("データが1本以下なら判定できない", () => {
    assert.deepEqual(detectCrosses([1], [3]), []);
    assert.deepEqual(detectCrosses([], []), []);
  });
});

// ---------------------------------------------------------------------------
// 全体の組み立て
// ---------------------------------------------------------------------------

describe("analyzeMovingAverages", () => {
  /** 100日下落（200→101）→ 60日上昇（104→281）のシナリオ */
  function makeDownThenUpBars(): PriceBar[] {
    const closes: number[] = [];
    for (let i = 0; i < 100; i++) closes.push(200 - i); // 200 → 101
    for (let i = 0; i < 60; i++) closes.push(104 + i * 3); // 104 → 281
    return makeBars(closes);
  }

  it("5日/25日のゴールデンクロスを手計算どおり105本目で検出する", () => {
    const bars = makeDownThenUpBars();
    const result = analyzeMovingAverages(bars);

    // クロス直前と直後の値を手計算と突き合わせる
    approx(result.sma5[104], 110, "104本目の5日線");
    approx(result.sma25[104], 110.4, "104本目の25日線");
    approx(result.sma5[105], 113, "105本目の5日線");
    approx(result.sma25[105], 110.36, "105本目の25日線");

    const signal = result.latest["5/25"];
    assert.ok(signal !== null, "5/25 のクロスが検出されていない");
    assert.equal(signal.type, "golden");
    assert.equal(signal.index, 105);
    assert.equal(signal.pair, "5/25");
  });

  it("25日/75日のゴールデンクロスを手計算どおり121本目で検出する", () => {
    const bars = makeDownThenUpBars();
    const result = analyzeMovingAverages(bars);

    approx(result.sma25[120], 128.96, "120本目の25日線");
    approx(result.sma75[120], 129.32, "120本目の75日線");
    approx(result.sma25[121], 131.48, "121本目の25日線");
    approx(result.sma75[121], 9712 / 75, "121本目の75日線");

    const signal = result.latest["25/75"];
    assert.ok(signal !== null, "25/75 のクロスが検出されていない");
    assert.equal(signal.type, "golden");
    assert.equal(signal.index, 121);
  });

  it("短期のクロスが中期のクロスより先に起きる", () => {
    const result = analyzeMovingAverages(makeDownThenUpBars());

    const shortTerm = result.latest["5/25"];
    const midTerm = result.latest["25/75"];
    assert.ok(shortTerm !== null && midTerm !== null);
    assert.ok(shortTerm.index < midTerm.index, "5日線のほうが反応が早いはず");
  });

  it("クロスの日付と「何日前か」が正しく付く", () => {
    const bars = makeDownThenUpBars();
    const result = analyzeMovingAverages(bars);

    const signal = result.latest["5/25"];
    assert.ok(signal !== null);
    assert.equal(signal.date, bars[105].date);
    assert.equal(signal.daysAgo, bars.length - 1 - 105); // 159 - 105 = 54
  });

  it("history は発生が古い順に並ぶ", () => {
    const result = analyzeMovingAverages(makeDownThenUpBars());

    assert.deepEqual(
      result.history.map((signal: CrossSignal) => [
        signal.pair,
        signal.type,
        signal.index,
      ]),
      [
        ["5/25", "golden", 105],
        ["25/75", "golden", 121],
      ],
    );
  });

  it("上がり続けるだけのデータでは交差しないのでクロスは出ない", () => {
    const closes = Array.from({ length: 120 }, (_, i) => 100 + i);
    const result = analyzeMovingAverages(makeBars(closes));

    assert.equal(result.latest["5/25"], null);
    assert.equal(result.latest["25/75"], null);
    assert.deepEqual(result.history, []);
  });

  it("75本しかないと25日/75日は判定できない（最低76本必要）", () => {
    const bars = makeDownThenUpBars().slice(0, 75);
    const result = analyzeMovingAverages(bars);

    approx(result.sma75[74], 163, "75本目の75日線"); // (200+126)/2
    assert.equal(result.sma75[73], null, "74本目はまだ確定しない");
    assert.equal(result.latest["25/75"], null);
  });

  it("データが空でも落ちない", () => {
    const result = analyzeMovingAverages([]);

    assert.deepEqual(result.sma5, []);
    assert.equal(result.latest["5/25"], null);
    assert.equal(result.latest["25/75"], null);
    assert.deepEqual(result.history, []);
  });
});

// ---------------------------------------------------------------------------
// バッジ表示用の判定
// ---------------------------------------------------------------------------

describe("isRecentGoldenCross", () => {
  const golden = (daysAgo: number): CrossSignal => ({
    pair: "5/25",
    type: "golden",
    index: 100,
    date: "2026-05-01",
    daysAgo,
  });

  it("既定では5日以内のゴールデンクロスを「最近」と判定する", () => {
    assert.equal(isRecentGoldenCross(golden(0)), true);
    assert.equal(isRecentGoldenCross(golden(5)), true);
    assert.equal(isRecentGoldenCross(golden(6)), false);
  });

  it("日数のしきい値を変えられる", () => {
    assert.equal(isRecentGoldenCross(golden(10), 20), true);
  });

  it("デッドクロスや未検出は false", () => {
    assert.equal(isRecentGoldenCross({ ...golden(1), type: "dead" }), false);
    assert.equal(isRecentGoldenCross(null), false);
  });
});
