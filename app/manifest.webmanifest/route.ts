// Web App Manifest。static export では build 時に out/manifest.webmanifest として書き出される。
// （app/manifest.ts の規約ファイルだと <link> が basePath を欠いて 404 になるため、route handler にしている。）
// 背景色・テーマ色はアイコンの地色（クリーム）に揃える。manifest はライト/ダークを分けられないため、
// 明暗どちらのスプラッシュでも破綻しない色にしている。
// ホーム画面に追加したときの名前・アイコン・起動 URL を定める。
// 配信先の basePath（/jichitai）込みで解決させるため、sitemap / layout と同じ BASE_PATH を使う。
import { BASE_PATH, SITE_DESCRIPTION, SITE_TITLE } from "../../lib/site.mjs";

export const dynamic = "force-static";

export function GET() {
  const manifest = {
    name: SITE_TITLE,
    short_name: "ジチタイ",
    description: SITE_DESCRIPTION,
    lang: "ja",
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    background_color: "#fbf3e6",
    theme_color: "#fbf3e6",
    icons: [
      {
        src: `${BASE_PATH}/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: `${BASE_PATH}/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: `${BASE_PATH}/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
