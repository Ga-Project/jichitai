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

export const metadata: Metadata = {
  title: "ジチタイ — 毎日の市区町村シルエット当て",
  description:
    "今日のシルエットは何市？日本の市区町村を、距離と方角のヒントを頼りに6回以内で当てる毎日更新のブラウザゲーム。",
  applicationName: "ジチタイ",
  openGraph: {
    title: "ジチタイ — 毎日の市区町村シルエット当て",
    description:
      "今日のシルエットは何市？距離と方角のヒントを頼りに6回以内で当てよう。毎日0時に更新。",
    type: "website",
    locale: "ja_JP",
    siteName: "ジチタイ",
  },
  twitter: {
    card: "summary",
    title: "ジチタイ — 毎日の市区町村シルエット当て",
    description:
      "今日のシルエットは何市？距離と方角のヒントを頼りに6回以内で当てよう。",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
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
