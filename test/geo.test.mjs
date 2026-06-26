import { test } from "node:test";
import assert from "node:assert/strict";
import {
  haversineKm,
  bearingDeg,
  directionIndex,
  directionFor,
  proximityPct,
  proximityBand,
  DIRECTIONS,
} from "../lib/geo.mjs";

// 東京(千代田) / 大阪 / 札幌 / 那覇 の代表座標
const TOKYO = [35.694, 139.753];
const OSAKA = [34.694, 135.5];
const SAPPORO = [43.06, 141.35];
const NAHA = [26.21, 127.68];

test("haversineKm: 同一地点は0", () => {
  assert.equal(haversineKm(TOKYO[0], TOKYO[1], TOKYO[0], TOKYO[1]), 0);
});

test("haversineKm: 東京-大阪 はおよそ400km", () => {
  const d = haversineKm(TOKYO[0], TOKYO[1], OSAKA[0], OSAKA[1]);
  assert.ok(d > 380 && d < 420, `got ${d}`);
});

test("haversineKm: 札幌-那覇 は2000km超", () => {
  const d = haversineKm(SAPPORO[0], SAPPORO[1], NAHA[0], NAHA[1]);
  assert.ok(d > 2000, `got ${d}`);
});

test("bearingDeg: 東京から見て大阪は西寄り(西〜南西)", () => {
  const b = bearingDeg(TOKYO[0], TOKYO[1], OSAKA[0], OSAKA[1]);
  const label = directionFor(b).label;
  assert.ok(["西", "南西"].includes(label), `bearing ${b} -> ${label}`);
});

test("bearingDeg: 東京から見て札幌は北寄り(北〜北東)", () => {
  const b = bearingDeg(TOKYO[0], TOKYO[1], SAPPORO[0], SAPPORO[1]);
  const label = directionFor(b).label;
  assert.ok(["北", "北東"].includes(label), `bearing ${b} -> ${label}`);
});

test("directionIndex: 境界と巻き戻し", () => {
  assert.equal(directionIndex(0), 0); // 北
  assert.equal(directionIndex(90), 2); // 東
  assert.equal(directionIndex(180), 4); // 南
  assert.equal(directionIndex(270), 6); // 西
  assert.equal(directionIndex(360), 0); // 一周
  assert.equal(directionIndex(-90), 6); // 負の角
});

test("DIRECTIONS は8方位そろう", () => {
  assert.equal(DIRECTIONS.length, 8);
});

test("proximityPct: 0kmで100、MAX以上で0、単調減少", () => {
  assert.equal(proximityPct(0), 100);
  assert.equal(proximityPct(2000), 0);
  assert.equal(proximityPct(5000), 0);
  assert.ok(proximityPct(100) > proximityPct(500));
});

test("proximityBand: 距離帯ごとの段", () => {
  assert.equal(proximityBand(0, true), 5); // 正解
  assert.equal(proximityBand(0, false), 4); // 極近だが未正解は最大P4
  assert.equal(proximityBand(50), 4);
  assert.equal(proximityBand(150), 3);
  assert.equal(proximityBand(400), 2);
  assert.equal(proximityBand(1200), 1);
});
