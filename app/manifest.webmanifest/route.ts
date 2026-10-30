// Web App Manifest。static export では build 時に out/manifest.webmanifest として書き出される。
// （app/manifest.ts の規約ファイルだと <link> が basePath を欠いて 404 になるため、route handler にしている。）
// ホーム画面に追加したときの名前・アイコン・起動 URL を定める。
// 配信先の basePath（/jichitai）込みで解決させるため、sitemap / layout と同じ BASE_PATH を使う。
const BASE_PATH = process.env.PAGES_BASE_PATH || "";

export const dynamic = "force-static";

export function GET() {
  const manifest = {
    name: "ジチタイ — 毎日の市区町村シルエット当て",
    short_name: "ジチタイ",
    description:
      "今日のシルエットは何市？日本の市区町村を、距離と方角のヒントを頼りに6回以内で当てる毎日更新のブラウザゲーム。",
    lang: "ja",
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    background_color: "#fefefd",
    theme_color: "#fefefd",
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
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
