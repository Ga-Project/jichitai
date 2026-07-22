// ジチタイ — 戦績（プレイ数・正解率・連続記録・推測回数の分布）。純関数・DOM 非依存。
//
// 記録の単位は「お題の通し日数」(lib/game.mjs の dayNumber)。カレンダー日付の差ではなく
// 通し日数で連続を判定するので、月跨ぎ・うるう年・端末TZに影響されない。
// また同じ日を二重に数えないので、その場で決着した時に呼んでも、同じ日に再訪して
// 決着済みの進捗を復元した時に呼んでも結果が変わらない
// （呼び出し側が記録済みフラグを持たなくてよい）。
//
// 保存形式のバージョンは値の中(v)に持つ。保存キーに版番号を載せると、スキーマを
// 変えた瞬間に旧キーが読まれなくなり連続記録が全消しになるため。

import { MAX_GUESSES } from "./game.mjs";

/** 保存する値のスキーマ版。読み込みは古い版も受け付ける。 */
export const STATS_SCHEMA = 1;

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
 *
 * 各フィールドの型・符号だけでなく、フィールド間の整合も守る。決着した日数
 * (played) を超える勝数・連続・分布は原理的にありえないので played で頭を抑える。
 * 正しい戦績に対しては全て恒等変換になる（勝数も連続も分布も played を超えない）。
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
  const raw_dist = Array.isArray(src.dist) ? src.dist : [];
  const played = toCount(src.played);
  const cap = (n) => Math.min(toCount(n), played);
  const streak = cap(src.streak);
  const wins = cap(src.wins);

  // 分布の合計は勝数を超えられない。超える分は前から詰めて切り捨てる。
  let budget = wins;
  const dist = base.dist.map((_, i) => {
    const v = Math.min(cap(raw_dist[i]), budget);
    budget -= v;
    return v;
  });

  return {
    played,
    wins,
    streak,
    maxStreak: Math.max(cap(src.maxStreak), streak),
    lastDay: Number.isFinite(src.lastDay) ? Math.floor(src.lastDay) : null,
    dist,
  };
}

/**
 * 保存用の文字列にする（スキーマ版を値の中に含める）。
 * @param {Stats} stats
 * @returns {string}
 */
export function serializeStats(stats) {
  return JSON.stringify({ v: STATS_SCHEMA, ...parseStats(stats) });
}

/**
 * 1 日ぶんの決着を記録する（既に記録済みの日・過去日は何もしない＝冪等）。
 *
 * 正解なのに推測回数が範囲外という記録は受け取らない。壊れた進捗を復元した時に
 * 起こりうるが、その日の分布・正解率が誤った値のまま確定してしまう（同じ日は
 * 二度と記録できない）ので、誤った記録を残すより記録しないほうを選ぶ。
 * @param {unknown} stats
 * @param {{day:number, won:boolean, guessCount:number}} result
 * @returns {Stats}
 */
export function recordResult(stats, { day, won, guessCount }) {
  const s = parseStats(stats);
  if (!Number.isFinite(day)) return s;
  if (won && !(guessCount >= 1 && guessCount <= MAX_GUESSES)) return s;
  const d = Math.floor(day);
  if (s.lastDay !== null && d <= s.lastDay) return s;

  const streak = won
    ? s.lastDay !== null && d === s.lastDay + 1
      ? s.streak + 1
      : 1
    : 0;
  const dist = s.dist.slice();
  if (won) dist[guessCount - 1] += 1; // 範囲は上のガードで保証済み

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
 * 表示・共有に使う「今つながっている」連続日数。
 *
 * 保存された streak は最後に記録した日のもので、そのまま出すと何日空けても
 * 途切れていないように見えてしまう（連鎖が切れたことは次に決着するまで
 * 保存値に現れない）。今日か昨日の記録で終わっている時だけ生きているとみなす
 * （昨日を含めるのは、今日まだプレイしていない人の連鎖はまだ切れていないため）。
 * @param {unknown} stats
 * @param {number} today お題の通し日数
 * @returns {number}
 */
export function currentStreak(stats, today) {
  const s = parseStats(stats);
  if (s.lastDay === null || !Number.isFinite(today)) return 0;
  const t = Math.floor(today);
  return t === s.lastDay || t === s.lastDay + 1 ? s.streak : 0;
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
