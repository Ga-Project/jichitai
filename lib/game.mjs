// ジチタイ — ゲーム進行ロジック（純関数・DOM 非依存）。
// 出題は JST 日付で決定論的に決まる（サーバ不要・全クライアントで同一）。

export const MAX_GUESSES = 6;
export const GAME_EPOCH = "2026-01-01"; // #1 の基準日（JST）

const DAY_MS = 86400000;

/** Date → JST(UTC+9) の {y,m,d}（実行環境のタイムゾーンに依存しない）。 */
export function jstParts(date) {
  const t = date.getTime() + 9 * 3600000; // UTC+9
  const d = new Date(t);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/** Date → "YYYY-MM-DD"（JST）。localStorage キー・日付表示に使う。 */
export function jstDateKey(date) {
  const { y, m, d } = jstParts(date);
  const p = (n) => String(n).padStart(2, "0");
  return `${y}-${p(m)}-${p(d)}`;
}

/** "YYYY-MM-DD" → JST 0時の UTC epoch(ms)。 */
function jstMidnightUtc(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - 9 * 3600000;
}

/** epoch 基準の通し日数（GAME_EPOCH=0）。 */
export function dayNumber(date) {
  const today = jstMidnightUtc(jstDateKey(date));
  const epoch = jstMidnightUtc(GAME_EPOCH);
  return Math.floor((today - epoch) / DAY_MS);
}

/** 表示用パズル番号（#1 始まり）。 */
export function puzzleNumber(date) {
  return dayNumber(date) + 1;
}

/** プール長に対する当日の回答インデックス（負日・周回に安全）。 */
export function answerIndex(date, poolLength) {
  if (poolLength <= 0) return 0;
  const n = dayNumber(date);
  return ((n % poolLength) + poolLength) % poolLength;
}

/** 次の JST 0時までの残りミリ秒。 */
export function msUntilNextJstMidnight(date) {
  const todayMid = jstMidnightUtc(jstDateKey(date));
  return todayMid + DAY_MS - date.getTime();
}

/**
 * インクリメンタル検索。前方一致を優先し部分一致を後置。
 * 候補は {c,n,p,...} の配列。query は trim 済みを想定。
 */
export function filterCandidates(query, municipalities, limit = 6) {
  const q = (query || "").trim();
  if (!q) return [];
  const starts = [];
  const includes = [];
  for (const m of municipalities) {
    const n = m.n;
    if (n === q || n.startsWith(q)) starts.push(m);
    else if (n.includes(q)) includes.push(m);
    if (starts.length >= limit) break;
  }
  return [...starts, ...includes].slice(0, limit);
}

/** 残り回数（負にしない）。 */
export function guessesLeft(usedCount) {
  return Math.max(0, MAX_GUESSES - usedCount);
}
