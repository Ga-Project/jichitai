// ジチタイ — 戦績（プレイ数・正解率・連続記録・推測回数の分布）。純関数・DOM 非依存。
//
// 記録の単位は「お題の通し日数」(lib/game.mjs の dayNumber)。カレンダー日付の差ではなく
// 通し日数で連続を判定するので、月跨ぎ・うるう年・端末TZに影響されない。
// また同じ日を二重に数えないので、復元した完了済みゲームと今その場で決着したゲームの
// どちらから呼んでも結果が同じになる（呼び出し側が記録済みフラグを持たなくてよい）。

import { MAX_GUESSES } from "./game.mjs";

/**
 * @typedef {object} Stats
 * @property {number} played 決着した日数
 * @property {number} wins 正解できた日数
 * @property {number} streak 現在の連続正解日数
 * @property {number} maxStreak 連続正解の自己最高
 * @property {number|null} lastDay 最後に記録したお題の通し日数（未記録なら null）
 * @property {number[]} dist 何回目で正解したかの分布（index 0 = 1回目）
 */

/**
 * 記録が1件も無い初期状態。
 * @returns {Stats}
 */
export function emptyStats() {
  return {
    played: 0,
    wins: 0,
    streak: 0,
    maxStreak: 0,
    lastDay: null,
    dist: Array.from({ length: MAX_GUESSES }, () => 0),
  };
}

function toCount(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * 保存値（JSON 文字列 / 任意のオブジェクト）を戦績に正規化する。
 * 壊れた保存・旧形式・手で書き換えられた値でも必ず正しい形の戦績を返す。
 * @param {unknown} raw
 * @returns {Stats}
 */
export function parseStats(raw) {
  let src = raw;
  if (typeof raw === "string") {
    try {
      src = JSON.parse(raw);
    } catch {
      return emptyStats();
    }
  }
  if (!src || typeof src !== "object") return emptyStats();

  const base = emptyStats();
  const dist = Array.isArray(src.dist) ? src.dist : [];
  return {
    played: toCount(src.played),
    wins: toCount(src.wins),
    streak: toCount(src.streak),
    maxStreak: Math.max(toCount(src.maxStreak), toCount(src.streak)),
    lastDay: Number.isFinite(src.lastDay) ? Math.floor(src.lastDay) : null,
    dist: base.dist.map((_, i) => toCount(dist[i])),
  };
}

/**
 * 1 日ぶんの決着を記録する（既に記録済みの日・過去日は何もしない＝冪等）。
 * @param {unknown} stats
 * @param {{day:number, won:boolean, guessCount:number}} result
 * @returns {Stats}
 */
export function recordResult(stats, { day, won, guessCount }) {
  const s = parseStats(stats);
  if (!Number.isFinite(day)) return s;
  const d = Math.floor(day);
  if (s.lastDay !== null && d <= s.lastDay) return s;

  const streak = won
    ? s.lastDay !== null && d === s.lastDay + 1
      ? s.streak + 1
      : 1
    : 0;
  const dist = s.dist.slice();
  if (won && guessCount >= 1 && guessCount <= MAX_GUESSES)
    dist[guessCount - 1] += 1;

  return {
    played: s.played + 1,
    wins: s.wins + (won ? 1 : 0),
    streak,
    maxStreak: Math.max(s.maxStreak, streak),
    lastDay: d,
    dist,
  };
}

/**
 * 正解率（％・整数）。未プレイなら 0。
 * @param {unknown} stats
 * @returns {number}
 */
export function winRatePct(stats) {
  const s = parseStats(stats);
  if (s.played <= 0) return 0;
  return Math.round((s.wins / s.played) * 100);
}

/**
 * 分布バーの基準になる最大値（0 除算を避けるため最低 1）。
 * @param {unknown} stats
 * @returns {number}
 */
export function distMax(stats) {
  return Math.max(1, ...parseStats(stats).dist);
}
