// ジチタイ — ゲームデータ生成スクリプト（ビルド前に一度実行）
// 入力: 国土数値情報（行政区域データ・政令市統合版）を加工した TopoJSON
//   出典: 国土数値情報（行政区域データ）国土交通省 / smartnews-smri/japan-topography
// 出力: <outDir>/municipalities.json, pool.json, sil/<code>.json
import { feature } from "topojson-client";
import { geoCentroid, geoArea, geoPath, geoMercator } from "d3-geo";
import fs from "node:fs";
import path from "node:path";

const SRC = process.argv[2];
const OUT = process.argv[3];
if (!SRC || !OUT) {
  console.error("usage: node build-data.mjs <source.topojson.json> <outDir>");
  process.exit(64);
}

// 都道府県 → 地方
const REGION = {
  北海道: "北海道",
  青森県: "東北", 岩手県: "東北", 宮城県: "東北", 秋田県: "東北", 山形県: "東北", 福島県: "東北",
  茨城県: "関東", 栃木県: "関東", 群馬県: "関東", 埼玉県: "関東", 千葉県: "関東", 東京都: "関東", 神奈川県: "関東",
  新潟県: "中部", 富山県: "中部", 石川県: "中部", 福井県: "中部", 山梨県: "中部", 長野県: "中部", 岐阜県: "中部", 静岡県: "中部", 愛知県: "中部",
  三重県: "近畿", 滋賀県: "近畿", 京都府: "近畿", 大阪府: "近畿", 兵庫県: "近畿", 奈良県: "近畿", 和歌山県: "近畿",
  鳥取県: "中国", 島根県: "中国", 岡山県: "中国", 広島県: "中国", 山口県: "中国",
  徳島県: "四国", 香川県: "四国", 愛媛県: "四国", 高知県: "四国",
  福岡県: "九州沖縄", 佐賀県: "九州沖縄", 長崎県: "九州沖縄", 熊本県: "九州沖縄", 大分県: "九州沖縄", 宮崎県: "九州沖縄", 鹿児島県: "九州沖縄", 沖縄県: "九州沖縄",
};

const topo = JSON.parse(fs.readFileSync(SRC, "utf8"));
const key = Object.keys(topo.objects)[0];
const fc = feature(topo, topo.objects[key]);

// code 単位に集約（多ポリゴン自治体・飛び地をまとめる）
const byCode = new Map();
for (const f of fc.features) {
  const p = f.properties;
  const code = p.N03_007;
  const name = p.N03_004 || p.N03_003; // 市区町村名（政令市は N03_003）
  const pref = p.N03_001;
  if (!code || !name || !pref) continue;
  if (!byCode.has(code)) byCode.set(code, { code, name, pref, geoms: [] });
  byCode.get(code).geoms.push(f.geometry);
}

// 重心・面積を計算
const munis = [];
for (const m of byCode.values()) {
  const gc = { type: "GeometryCollection", geometries: m.geoms };
  const [lng, lat] = geoCentroid(gc);
  const area = geoArea(gc); // steradians（相対比較用）
  munis.push({ ...m, lat, lng, area, gc, region: REGION[m.pref] || "その他" });
}

// municipalities.json（全自治体・推測ユニバース）
const muniOut = munis
  .map((m) => ({ c: m.code, n: m.name, p: m.pref, r: m.region, lat: +m.lat.toFixed(4), lng: +m.lng.toFixed(4) }))
  .sort((a, b) => a.c.localeCompare(b.c));

// 回答プール = 市 + 東京特別区（認知可能な範囲）
const answers = munis.filter((m) => m.name.endsWith("市") || m.name.endsWith("区"));

// 面積階級（1=小 〜 5=大）: 回答プール内で五分位
const sortedArea = [...answers].sort((a, b) => a.area - b.area);
const areaLevel = new Map();
sortedArea.forEach((m, i) => areaLevel.set(m.code, Math.min(5, Math.floor((i / sortedArea.length) * 5) + 1)));

// 決定的シャッフル（mulberry32, 固定シード）— コード順の偏りを除去
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260626);
const shuffled = [...answers];
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
const poolOut = shuffled.map((m) => ({ c: m.code, a: areaLevel.get(m.code) }));

// シルエット SVG path（回答プールのみ・遅延ロード）
const VB = 100;
const PAD = 8;
fs.mkdirSync(path.join(OUT, "sil"), { recursive: true });
let silBytes = 0;
for (const m of answers) {
  const fcOne = { type: "Feature", geometry: { type: "GeometryCollection", geometries: m.geoms } };
  const proj = geoMercator().fitExtent(
    [[PAD, PAD], [VB - PAD, VB - PAD]],
    fcOne
  );
  const pathGen = geoPath(proj);
  let d = pathGen(fcOne);
  // 座標を小数1桁に丸めて軽量化
  d = d.replace(/-?\d+\.\d+/g, (s) => (+s).toFixed(1));
  const out = JSON.stringify({ d, vb: VB }) + "\n";
  fs.writeFileSync(path.join(OUT, "sil", `${m.code}.json`), out);
  silBytes += out.length;
}

fs.writeFileSync(path.join(OUT, "municipalities.json"), JSON.stringify(muniOut) + "\n");
fs.writeFileSync(path.join(OUT, "pool.json"), JSON.stringify(poolOut) + "\n");

console.log("municipalities:", muniOut.length, (fs.statSync(path.join(OUT, "municipalities.json")).size / 1024).toFixed(0) + "KB");
console.log("pool(answers):", poolOut.length, (fs.statSync(path.join(OUT, "pool.json")).size / 1024).toFixed(0) + "KB");
console.log("silhouettes:", answers.length, "files,", (silBytes / 1024).toFixed(0) + "KB total, avg", (silBytes / answers.length).toFixed(0) + "B");
