import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyStats,
  parseStats,
  recordResult,
  winRatePct,
  distMax,
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
  assert.equal(s.played, 0);
  assert.equal(s.wins, 0);
  assert.equal(s.maxStreak, 4, "maxStreak は streak を下回らない");
  assert.deepEqual(s.dist, [1, 0, 0, 0, 0, 0]);
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
  assert.equal(distMax({ ...emptyStats(), dist: [0, 3, 1, 0, 0, 0] }), 3);
});
