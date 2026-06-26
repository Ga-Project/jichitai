// ジチタイ — 地理計算（純関数・DOM 非依存・node:test で検証可能）。
// 距離は Haversine、方角は初期方位角。すべて単体テスト対象。

const R_KM = 6371; // 地球半径(km)
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/** 2点間の大圏距離(km)。 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** from→to の初期方位角(度, 0..360, 北=0, 時計回り)。 */
export function bearingDeg(lat1, lng1, lat2, lng2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// 8方位（北始まり・時計回り）。arrow は色非依存表示、label は SR/テキスト併記用。
export const DIRECTIONS = [
  { key: "N", arrow: "↑", label: "北" },
  { key: "NE", arrow: "↗", label: "北東" },
  { key: "E", arrow: "→", label: "東" },
  { key: "SE", arrow: "↘", label: "南東" },
  { key: "S", arrow: "↓", label: "南" },
  { key: "SW", arrow: "↙", label: "南西" },
  { key: "W", arrow: "←", label: "西" },
  { key: "NW", arrow: "↖", label: "北西" },
];

/** 方位角(度) → 8方位インデックス(0..7)。 */
export function directionIndex(deg) {
  return Math.round(((deg % 360) + 360) % 360 / 45) % 8;
}

/**
 * 方位角(度) → 方位オブジェクト。
 * @returns {{key:string, arrow:string, label:string}}
 */
export function directionFor(deg) {
  return DIRECTIONS[directionIndex(deg)] || DIRECTIONS[0];
}

export const MAX_KM = 2000; // 近さ%の基準（北海道-沖縄の対角を概ねカバー）

/** 距離(km) → 近さ%(0..100)。近いほど大。 */
export function proximityPct(distKm, maxKm = MAX_KM) {
  return Math.round(Math.max(0, 1 - distKm / maxKm) * 100);
}

/**
 * 近さ帯 1..5（1=遠い 〜 5=正解/極近）。
 * 距離目安: <=50→P4, <=150→P3, <=400→P2, >400→P1。正解(isCorrect)のみ P5。
 */
export function proximityBand(distKm, isCorrect = false) {
  if (isCorrect) return 5;
  if (distKm <= 50) return 4;
  if (distKm <= 150) return 3;
  if (distKm <= 400) return 2;
  return 1;
}
