import { test } from "node:test";
import assert from "node:assert/strict";
import {
  jstDateKey,
  jstParts,
  dayNumber,
  puzzleNumber,
  answerIndex,
  msUntilNextJstMidnight,
  filterCandidates,
  guessesLeft,
  GAME_EPOCH,
  MAX_GUESSES,
} from "../lib/game.mjs";

test("jstDateKey: UTC夜は翌日のJST日付になる(タイムゾーン非依存)", () => {
  // 2026-06-26T15:30:00Z = JST 2026-06-27 00:30
  assert.equal(jstDateKey(new Date("2026-06-26T15:30:00Z")), "2026-06-27");
  // 2026-06-26T14:00:00Z = JST 2026-06-26 23:00
  assert.equal(jstDateKey(new Date("2026-06-26T14:00:00Z")), "2026-06-26");
});

test("jstParts: 構成要素", () => {
  assert.deepEqual(jstParts(new Date("2026-01-01T00:00:00+09:00")), {
    y: 2026,
    m: 1,
    d: 1,
  });
});

test("dayNumber/puzzleNumber: epochは#1", () => {
  const epochNoon = new Date(`${GAME_EPOCH}T03:00:00Z`); // JST正午
  assert.equal(dayNumber(epochNoon), 0);
  assert.equal(puzzleNumber(epochNoon), 1);
});

test("dayNumber: 翌日は+1", () => {
  const d0 = new Date(`${GAME_EPOCH}T03:00:00Z`);
  const d1 = new Date(d0.getTime() + 86400000);
  assert.equal(dayNumber(d1) - dayNumber(d0), 1);
});

test("answerIndex: 周回し範囲内に収まる", () => {
  const len = 815;
  for (const day of [0, 1, 814, 815, 816, 5000]) {
    const date = new Date(jstMidnightToUtcNoon(day));
    const idx = answerIndex(date, len);
    assert.ok(idx >= 0 && idx < len, `idx ${idx} for day ${day}`);
  }
  assert.equal(answerIndex(new Date(`${GAME_EPOCH}T03:00:00Z`), len), 0);
});

test("answerIndex: poolLength<=0 は0", () => {
  assert.equal(answerIndex(new Date(), 0), 0);
});

test("msUntilNextJstMidnight: 0..1日の範囲", () => {
  const ms = msUntilNextJstMidnight(new Date("2026-06-26T10:00:00Z"));
  assert.ok(ms > 0 && ms <= 86400000, `got ${ms}`);
});

const MUNI = [
  { c: "13104", n: "新宿区", p: "東京都" },
  { c: "13201", n: "八王子市", p: "東京都" },
  { c: "27100", n: "大阪市", p: "大阪府" },
  { c: "13209", n: "東村山市", p: "東京都" },
  { c: "13213", n: "東大和市", p: "東京都" },
];

test("filterCandidates: 前方一致が部分一致より前に来る", () => {
  const list = [
    { c: "1", n: "東村山市", p: "東京都" }, // 「山」は部分一致
    { c: "2", n: "山形市", p: "山形県" }, // 「山」は前方一致
    { c: "3", n: "新宿区", p: "東京都" }, // 非該当
  ];
  const r = filterCandidates("山", list);
  const idxPrefix = r.findIndex((m) => m.n === "山形市");
  const idxSubstr = r.findIndex((m) => m.n === "東村山市");
  assert.ok(
    idxPrefix >= 0 && idxSubstr >= 0,
    "前方一致・部分一致の両方がヒットする",
  );
  assert.ok(idxPrefix < idxSubstr, "前方一致が部分一致より前に並ぶ");
  assert.ok(
    !r.some((m) => m.n === "新宿区"),
    "クエリを含まない候補は除外される",
  );
});

test("filterCandidates: 空クエリは空配列", () => {
  assert.deepEqual(filterCandidates("", MUNI), []);
  assert.deepEqual(filterCandidates("   ", MUNI), []);
});

test("filterCandidates: 件数制限", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    c: String(i),
    n: `市${i}市`,
    p: "x",
  }));
  assert.equal(filterCandidates("市", many, 6).length, 6);
});

test("guessesLeft: 上限と下限", () => {
  assert.equal(guessesLeft(0), MAX_GUESSES);
  assert.equal(guessesLeft(MAX_GUESSES), 0);
  assert.equal(guessesLeft(MAX_GUESSES + 3), 0);
});

// helper: 指定 dayNumber に対応する JST 正午の UTC 時刻
function jstMidnightToUtcNoon(day) {
  const [y, m, d] = GAME_EPOCH.split("-").map(Number);
  const epochMid = Date.UTC(y, m - 1, d) - 9 * 3600000;
  return epochMid + day * 86400000 + 12 * 3600000;
}
