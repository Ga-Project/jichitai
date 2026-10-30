// サイト全体で共有する配信先・文言の定数。
// layout / sitemap / manifest が同じ値を参照し、basePath や説明文のずれを防ぐ。

// GitHub Pages のプロジェクトページ配信では basePath（/jichitai）が付く。
// 先頭 "/" ・末尾 "/" なしに正規化する（"jichitai/" や "/jichitai/" が渡されても壊れない）。
function normalizeBasePath(raw) {
  const trimmed = (raw ?? "").trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}` : "";
}

export const BASE_PATH = normalizeBasePath(process.env.PAGES_BASE_PATH);
export const SITE_URL = `https://ga-project.github.io${BASE_PATH}/`;
export const SITE_TITLE = "ジチタイ — 毎日の市区町村シルエット当て";
export const SITE_DESCRIPTION =
  "今日のシルエットは何市？日本の市区町村を、距離と方角のヒントを頼りに6回以内で当てる毎日更新のブラウザゲーム。";
