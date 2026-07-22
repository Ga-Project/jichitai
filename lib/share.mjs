// ジチタイ — 結果共有テキスト（ネタバレなし）。
// 地名・距離は一切含めない。近さ帯の絵文字＋方角のみで結果を再現する。

// 近さ帯(1..5) → 3マスの絵文字。色覚に依存せず「塗り数」でも近さが伝わる。
const BAND_SQUARES = {
  5: "🟩🟩🟩",
  4: "🟩🟩⬜",
  3: "🟨🟨⬜",
  2: "🟧⬜⬜",
  1: "🟥⬜⬜",
};

/**
 * @param {Array<{band:number, arrow:string, isCorrect:boolean}>} guesses
 * @param {{puzzleNumber:number, won:boolean, url:string}} opts
 */
export function buildShareText(guesses, { puzzleNumber, won, url }) {
  const score = won ? `${guesses.length}/6` : `X/6`;
  const head = `ジチタイ #${puzzleNumber} ${score}`;
  const rows = guesses.map((g) => {
    const squares = BAND_SQUARES[g.band] || BAND_SQUARES[1];
    const dir = g.isCorrect ? "⭐" : g.arrow;
    return `${squares}${dir}`;
  });
  return [head, ...rows, url].join("\n");
}
