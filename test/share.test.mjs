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
