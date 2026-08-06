import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import "./globals.css";
import "./theme.css";

// 公開アナリティクス（cookieless・GoatCounter）。
// 公開直前に NEXT_PUBLIC_GOATCOUNTER_CODE をビルド時に渡すとタグが有効化される
// （例: NEXT_PUBLIC_GOATCOUNTER_CODE=jichitai pnpm build）。
// 値は秘密ではない公開コード。未設定の間はタグを出さない（壊れた src を出さない）。
const GOATCOUNTER_CODE = process.env.NEXT_PUBLIC_GOATCOUNTER_CODE ?? "";

// OGP 画像は絶対 URL でしか解決されないため、配信先を metadataBase に据える。
// プロジェクトページ配信では basePath（/jichitai）配下に og.png が出るので、
// 末尾スラッシュ付きの base に相対パス "og.png" を解決させて basePath 込みの URL を得る。
const BASE_PATH = process.env.PAGES_BASE_PATH || "";
const SITE_URL = `https://ga-project.github.io${BASE_PATH}/`;
const OG_IMAGE = {
  url: "og.png",
  width: 1200,
  height: 630,
  alt: "ジチタイ — 今日の市区町村シルエットを、距離と方角のヒントで6回以内に当てる毎日更新のゲーム",
};

// 構造化データ（schema.org / JSON-LD）。検索エンジンに「無料で遊べる
// 日本語の毎日更新ブラウザゲーム」という実体を明示し、リッチリザルトの
// 対象になりやすくする。metadataBase と同じ絶対 URL を使う（basePath 込み）。
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: "ジチタイ",
  alternateName: "ジチタイ — 毎日の市区町村シルエット当て",
  url: SITE_URL,
  image: `${SITE_URL}${OG_IMAGE.url}`,
  description:
    "今日のシルエットは何市？日本の市区町村を、距離と方角のヒントを頼りに6回以内で当てる毎日更新のブラウザゲーム。",
  inLanguage: "ja",
  genre: "パズル・地理クイズ",
  applicationCategory: "GameApplication",
  gamePlatform: "Web browser",
  operatingSystem: "Any",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "ジチタイ — 毎日の市区町村シルエット当て",
  description:
    "今日のシルエットは何市？日本の市区町村を、距離と方角のヒントを頼りに6回以内で当てる毎日更新のブラウザゲーム。",
  applicationName: "ジチタイ",
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: "ジチタイ — 毎日の市区町村シルエット当て",
    description:
      "今日のシルエットは何市？距離と方角のヒントを頼りに6回以内で当てよう。毎日0時に更新。",
    type: "website",
    locale: "ja_JP",
    siteName: "ジチタイ",
    url: SITE_URL,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "ジチタイ — 毎日の市区町村シルエット当て",
    description:
      "今日のシルエットは何市？距離と方角のヒントを頼りに6回以内で当てよう。",
    images: [OG_IMAGE],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <script
          type="application/ld+json"
          // 構造化データは静的な既知値のみ（ユーザー入力を含まない）。
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        {children}
        {GOATCOUNTER_CODE ? (
          <Script
            data-goatcounter={`https://${GOATCOUNTER_CODE}.goatcounter.com/count`}
            src="//gc.zgo.at/count.js"
            strategy="afterInteractive"
          />
        ) : null}
      </body>
    </html>
  );
}
