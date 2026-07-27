import { test } from "node:test";
import assert from "node:assert/strict";
import { buildShareText } from "../lib/share.mjs";

const URL = "https://ga-project.github.io/jichitai/";

test("buildShareText: 勝利は回数/6・正解行は⭐", () => {
  const guesses = [
    { band: 1, arrow: "↗", isCorrect: false },
    { band: 3, arrow: "←", isCorrect: false },
    { band: 5, arrow: "↑", isCorrect: true },
  ];
  const txt = buildShareText(guesses, { puzzleNumber: 128, won: true, url: URL });
  const lines = txt.split("\n");
  assert.equal(lines[0], "ジチタイ #128 3/6");
  assert.ok(lines[3].includes("⭐")); // 正解行
  assert.equal(lines[lines.length - 1], URL);
});

test("buildShareText: 敗北は X/6", () => {
  const guesses = Array.from({ length: 6 }, () => ({ band: 1, arrow: "↓", isCorrect: false }));
  const txt = buildShareText(guesses, { puzzleNumber: 5, won: false, url: URL });
  assert.ok(txt.startsWith("ジチタイ #5 X/6"));
  assert.ok(!txt.includes("⭐"));
});

test("buildShareText: 地名・距離・km を含めない(ネタバレ防止)", () => {
  const guesses = [{ band: 2, arrow: "→", isCorrect: false }, { band: 5, arrow: "↑", isCorrect: true }];
  const txt = buildShareText(guesses, { puzzleNumber: 1, won: true, url: URL });
  assert.ok(!/km|市|区|町|村|距離/.test(txt.replace(URL, "")));
});

test("buildShareText: 各推測行に近さ絵文字3マス", () => {
  const guesses = [{ band: 4, arrow: "↗", isCorrect: false }];
  const txt = buildShareText(guesses, { puzzleNumber: 1, won: false, url: URL });
  const row = txt.split("\n")[1];
  // 絵文字3マス + 方角
  assert.ok(row.includes("🟩") || row.includes("🟨") || row.includes("🟧") || row.includes("🟥"));
  assert.ok(row.includes("↗"));
});

test("buildShareText: 連続2日以上は見出しに🔥、1日以下は付けない", () => {
  const guesses = [{ band: 5, arrow: "↑", isCorrect: true }];
  const opts = { puzzleNumber: 9, won: true, url: URL };
  assert.equal(buildShareText(guesses, { ...opts, streak: 4 }).split("\n")[0], "ジチタイ #9 1/6 🔥4");
  assert.equal(buildShareText(guesses, { ...opts, streak: 1 }).split("\n")[0], "ジチタイ #9 1/6");
  assert.equal(buildShareText(guesses, opts).split("\n")[0], "ジチタイ #9 1/6");
});

// 「Xでポスト」導線(onShareX)は共有本文を x.com/intent に載せる。X は絵文字・日本語を
// 1文字=加重2、URLをt.co固定23で数え、280加重を超えると投稿ボタンが無効化される。
// 最悪ケース(6行敗北・大きな番号と連続日数)でも投稿が壊れないことを固定する。
test("buildShareText: 最悪ケースでもX加重280以内(全ブラウザ1タップ投稿が壊れない)", () => {
  const guesses = Array.from({ length: 6 }, () => ({ band: 1, arrow: "↓", isCorrect: false }));
  const txt = buildShareText(guesses, { puzzleNumber: 9999, won: false, url: URL, streak: 9999 });
  // 保守的上界: URL 行以外の全コードポイントを加重2、URL を t.co 固定23として合算。
  const withoutUrl = txt.split(URL).join("");
  const weight = [...withoutUrl].length * 2 + 23;
  assert.ok(weight < 280, `X加重の保守上界 ${weight} が280を超過`);
});
