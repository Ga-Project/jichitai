# ジチタイ

日本の市区町村を題材にした、毎日更新のシルエット当てブラウザゲーム（Worldle/Wordle 型）。
今日のお題のシルエットを見て、距離・方角・近さのヒントを頼りに 6 回以内で市区町村名を当てる。
正解後は結果をネタバレなしの絵文字グリッドで SNS 共有できる。

Next.js 14 (App Router) の static export（`out/` への静的書き出し）。実行時サーバを持たない。

## セットアップ & 開発

```bash
./setup.sh                 # pnpm install
pnpm dev                   # http://localhost:3000（ホットリロード）
```

## ビルド（static export）

```bash
pnpm build                 # next build → out/ に静的 HTML/CSS/JS/データを生成
./run.sh serve             # out/ をビルドしてローカル配信（http://localhost:3000）
```

`out/` がそのまま配信物。GitHub Pages のプロジェクトページ（`<owner>.github.io/jichitai/`）配信では、
ビルド時に `PAGES_BASE_PATH=/jichitai` を渡してアセットをサブパス基準で出力する
（同梱の `.github/workflows/pages.yml` が設定済み）。

## テスト

```bash
pnpm test                  # node --test（標準ランナー）
```

ゲームの純ロジック（距離・方角・近さ・出題日付・絵文字グリッド・候補検索）を `lib/*.mjs` に分離し、
`test/*.test.mjs` で検証している。

## ゲームデータの再生成

出題・推測に使うデータ（全市区町村の代表座標、回答プール、シルエット）は
`scripts/build-data.mjs` で元データから生成し、`public/data/` に出力する。

```bash
pnpm run build:data        # scripts/source/muni.topojson.json → public/data/
```

- `public/data/municipalities.json` … 全市区町村の名称・都道府県・地方・代表座標（推測候補・距離計算用）
- `public/data/pool.json` … 回答プール（市・特別区）の出題順と面積階級
- `public/data/sil/<コード>.json` … 各回答のシルエット（SVG パス・当日分のみ取得）

回答は毎日 0 時（JST）に切り替わる。プールの並びは固定シードで決定的に決まるため、
全プレイヤーで同じ日のお題が一致する。

## データ出典

地図形状・行政区域は次のオープンデータを加工して作成している。

- 「国土数値情報（行政区域データ）」（国土交通省） https://nlftp.mlit.go.jp/ksj/
- 上記を軽量化・整形した中間データ: smartnews-smri/japan-topography（政令指定都市統合版・N03-21）

利用条件に従い、出典クレジット「『国土数値情報（行政区域データ）』（国土交通省）を加工して作成」を
画面フッターに常時表示している。

## 構成

```
jichitai/
├─ app/
│  ├─ page.tsx              # ゲーム本体（クライアントコンポーネント）
│  ├─ layout.tsx            # SEO/OGP メタ・アナリティクススロット
│  ├─ globals.css           # 共通デザイン基盤トークン
│  ├─ theme.css             # 製品テーマ & ゲーム UI（和モダン・色覚多様性対応）
│  └─ not-found.tsx         # 404
├─ lib/                     # 純ロジック（DOM 非依存・テスト対象）
│  ├─ geo.mjs               # 距離・方角・近さ
│  ├─ game.mjs              # 出題日付・回答決定・候補検索
│  └─ share.mjs             # 絵文字グリッド共有
├─ public/data/             # 生成済みゲームデータ
├─ scripts/
│  ├─ build-data.mjs        # ゲームデータ生成
│  └─ source/               # 生成元データ（オープンデータ・出典上記）
├─ test/                    # node:test
└─ next.config.mjs          # output: "export" / PAGES_BASE_PATH 対応
```

## アクセシビリティ

距離は数値・バー長・色の三重で提示し、方角は矢印＋日本語ラベルを併記する（色だけに依存しない）。
コントラスト AA・`:focus-visible` リング・`prefers-reduced-motion` 配慮・タッチ 44px・キーボード操作完結。
