import type { MetadataRoute } from "next";

// サイトマップ。static export では build 時に out/sitemap.xml として書き出される。
// URL は layout の metadataBase と同じ絶対 URL（basePath 込み）に揃える。
// 単一ページの毎日更新ゲームなので、トップ 1 URL を daily 更新頻度で自己参照する。
const BASE_PATH = process.env.PAGES_BASE_PATH || "";
const SITE_URL = `https://ga-project.github.io${BASE_PATH}/`;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
