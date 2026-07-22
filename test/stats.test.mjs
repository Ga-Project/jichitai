import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyStats,
  parseStats,
  recordResult,
  serializeStats,
  currentStreak,
  winRatePct,
  distMax,
  STATS_SCHEMA,
} from "../lib/stats.mjs";

test("emptyStats: 未プレイの初期値", () => {
  const s = emptyStats();
  assert.equal(s.played, 0);
  assert.equal(s.wins, 0);
  assert.equal(s.streak, 0);
  assert.equal(s.maxStreak, 0);
  assert.equal(s.lastDay, null);
  assert.deepEqual(s.dist, [0, 0, 0, 0, 0, 0]);
});

test("recordResult: 勝利を記録すると連続が 1 から始まる", () => {
  const s = recordResult(emptyStats(), { day: 10, won: true, guessCount: 3 });
  assert.equal(s.played, 1);
  assert.equal(s.wins, 1);
  assert.equal(s.streak, 1);
  assert.equal(s.maxStreak, 1);
  assert.equal(s.lastDay, 10);
  assert.deepEqual(s.dist, [0, 0, 1, 0, 0, 0]);
});

test("recordResult: 翌日も勝つと連続が伸びる", () => {
  let s = recordResult(emptyStats(), { day: 10, won: true, guessCount: 2 });
  s = recordResult(s, { day: 11, won: true, guessCount: 5 });
  assert.equal(s.streak, 2);
  assert.equal(s.maxStreak, 2);
  assert.deepEqual(s.dist, [0, 1, 0, 0, 1, 0]);
});

test("recordResult: 1 日空くと連続がリセットされ最高記録は残る", () => {
  let s = recordResult(emptyStats(), { day: 1, won: true, guessCount: 1 });
  s = recordResult(s, { day: 2, won: true, guessCount: 1 });
  s = recordResult(s, { day: 5, won: true, guessCount: 4 }); // 3,4 日目は未プレイ
  assert.equal(s.streak, 1);
  assert.equal(s.maxStreak, 2);
  assert.equal(s.played, 3);
});

test("recordResult: 敗北で連続は 0・分布には入らない", () => {
  let s = recordResult(emptyStats(), { day: 7, won: true, guessCount: 4 });
  s = recordResult(s, { day: 8, won: false, guessCount: 6 });
  assert.equal(s.streak, 0);
  assert.equal(s.maxStreak, 1);
  assert.equal(s.played, 2);
  assert.equal(s.wins, 1);
  assert.deepEqual(s.dist, [0, 0, 0, 1, 0, 0]);
});

test("recordResult: 敗北の翌日に勝つと連続は 1 から再開する", () => {
  let s = recordResult(emptyStats(), { day: 8, won: false, guessCount: 6 });
  s = recordResult(s, { day: 9, won: true, guessCount: 2 });
  assert.equal(s.streak, 1);
});

test("recordResult: 同じ日を二重に記録しない(冪等)", () => {
  const first = recordResult(emptyStats(), {
    day: 20,
    won: true,
    guessCount: 3,
  });
  const again = recordResult(first, { day: 20, won: true, guessCount: 3 });
  assert.deepEqual(again, first);
});

test("recordResult: 記録済みより過去の日は無視する", () => {
  const first = recordResult(emptyStats(), {
    day: 20,
    won: true,
    guessCount: 3,
  });
  const past = recordResult(first, { day: 19, won: false, guessCount: 6 });
  assert.deepEqual(past, first);
});

test("recordResult: 不正な日付は状態を変えない", () => {
  const s = emptyStats();
  assert.deepEqual(recordResult(s, { day: NaN, won: true, guessCount: 1 }), s);
});

test("parseStats: 壊れた保存値でも正しい形に戻す", () => {
  assert.deepEqual(parseStats("{壊れたJSON"), emptyStats());
  assert.deepEqual(parseStats(null), emptyStats());
  assert.deepEqual(parseStats(42), emptyStats());
  const s = parseStats({
    played: -3,
    wins: "x",
    streak: 4,
    maxStreak: 1,
    dist: [1, null],
  });
  assert.deepEqual(s, emptyStats(), "決着0日なら勝数も連続も分布も立たない");
});

test("parseStats: 決着日数を超える勝数・連続・分布は切り詰める", () => {
  const s = parseStats({
    played: 1,
    wins: 5,
    streak: 9,
    maxStreak: 9,
    dist: [3, 3],
  });
  assert.equal(s.played, 1);
  assert.equal(s.wins, 1, "勝数は決着日数を超えない");
  assert.equal(s.streak, 1);
  assert.equal(s.maxStreak, 1);
  assert.deepEqual(s.dist, [1, 0, 0, 0, 0, 0], "分布の合計は勝数を超えない");
  assert.equal(winRatePct(s), 100, "正解率が 100% を超えない");
});

test("parseStats: 正しい戦績には手を加えない(恒等)", () => {
  let s = recordResult(emptyStats(), { day: 1, won: true, guessCount: 3 });
  s = recordResult(s, { day: 2, won: false, guessCount: 6 });
  s = recordResult(s, { day: 3, won: true, guessCount: 1 });
  assert.deepEqual(parseStats(s), s);
  assert.deepEqual(
    parseStats(serializeStats(s)),
    s,
    "保存して読み直しても同じ",
  );
});

test("serializeStats: スキーマ版を値の中に持ち、キーに載せない", () => {
  const s = recordResult(emptyStats(), { day: 1, won: true, guessCount: 2 });
  const saved = JSON.parse(serializeStats(s));
  assert.equal(saved.v, STATS_SCHEMA);
  assert.deepEqual(parseStats(saved), s, "版フィールドがあっても読める");
});

test("parseStats: 版フィールドの無い値も読める(将来の版上げで記録を捨てない)", () => {
  const s = recordResult(emptyStats(), { day: 4, won: true, guessCount: 5 });
  assert.deepEqual(parseStats(JSON.stringify(s)), s);
});

test("recordResult: 正解なのに推測回数が範囲外なら記録しない", () => {
  const base = emptyStats();
  // 壊れた進捗の復元で起こりうる。誤った分布を確定させるより記録しない。
  assert.deepEqual(
    recordResult(base, { day: 5, won: true, guessCount: 0 }),
    base,
  );
  assert.deepEqual(
    recordResult(base, { day: 5, won: true, guessCount: 7 }),
    base,
  );
  assert.deepEqual(
    recordResult(base, { day: 5, won: true, guessCount: NaN }),
    base,
  );
  // 敗北は回数に依存しないので記録する
  assert.equal(
    recordResult(base, { day: 5, won: false, guessCount: 0 }).played,
    1,
  );
});

test("recordResult: 記録初日が通し日数 0 でも冪等に効く", () => {
  const first = recordResult(emptyStats(), {
    day: 0,
    won: true,
    guessCount: 2,
  });
  assert.equal(first.lastDay, 0);
  assert.deepEqual(
    recordResult(first, { day: 0, won: true, guessCount: 2 }),
    first,
  );
  assert.equal(
    recordResult(first, { day: 1, won: true, guessCount: 2 }).streak,
    2,
  );
});

test("recordResult: 保存文字列を直接受け取れる(本番の記録経路)", () => {
  const saved = serializeStats(
    recordResult(emptyStats(), { day: 9, won: true, guessCount: 2 }),
  );
  const next = recordResult(saved, { day: 10, won: true, guessCount: 3 });
  assert.equal(next.played, 2);
  assert.equal(next.streak, 2);
});

test("parseStats: JSON 文字列を受け取れる", () => {
  const saved = JSON.stringify(
    recordResult(emptyStats(), { day: 3, won: true, guessCount: 6 }),
  );
  assert.equal(parseStats(saved).lastDay, 3);
});

test("winRatePct: 未プレイは 0・四捨五入する", () => {
  assert.equal(winRatePct(emptyStats()), 0);
  assert.equal(winRatePct({ ...emptyStats(), played: 3, wins: 2 }), 67);
  assert.equal(winRatePct({ ...emptyStats(), played: 4, wins: 4 }), 100);
});

test("distMax: 0 除算を避けて最低 1 を返す", () => {
  assert.equal(distMax(emptyStats()), 1);
  assert.equal(
    distMax({ ...emptyStats(), played: 4, wins: 4, dist: [0, 3, 1, 0, 0, 0] }),
    3,
  );
});

test("currentStreak: 今日か昨日の記録で終わっていれば生きている", () => {
  const s = {
    ...emptyStats(),
    played: 5,
    wins: 5,
    streak: 5,
    maxStreak: 5,
    lastDay: 100,
  };
  assert.equal(currentStreak(s, 100), 5, "今日決着済み");
  assert.equal(currentStreak(s, 101), 5, "今日まだプレイしていないだけ");
});

test("currentStreak: 日が空いたら 0（切れた連鎖を名乗らない）", () => {
  const s = {
    ...emptyStats(),
    played: 40,
    wins: 38,
    streak: 12,
    maxStreak: 12,
    lastDay: 100,
  };
  assert.equal(currentStreak(s, 102), 0, "2日空けば切れている");
  assert.equal(currentStreak(s, 203), 0, "103日空けても 12 とは言わない");
  assert.equal(s.streak, 12, "保存値そのものは書き換えない");
});

test("currentStreak: 未記録・不正な日付は 0", () => {
  assert.equal(currentStreak(emptyStats(), 10), 0);
  assert.equal(
    currentStreak({ ...emptyStats(), played: 1, streak: 1, lastDay: 3 }, NaN),
    0,
  );
});

test("currentStreak: 敗北で 0 に落ちた連鎖は 0 のまま", () => {
  const s = recordResult(
    recordResult(emptyStats(), { day: 1, won: true, guessCount: 2 }),
    {
      day: 2,
      won: false,
      guessCount: 6,
    },
  );
  assert.equal(currentStreak(s, 2), 0);
});
