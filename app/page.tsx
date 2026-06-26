"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  haversineKm,
  bearingDeg,
  directionFor,
  proximityPct,
  proximityBand,
} from "@/lib/geo.mjs";
import {
  MAX_GUESSES,
  jstDateKey,
  puzzleNumber,
  answerIndex,
  msUntilNextJstMidnight,
  filterCandidates,
  guessesLeft,
} from "@/lib/game.mjs";
import { buildShareText } from "@/lib/share.mjs";

type Muni = {
  c: string;
  n: string;
  p: string;
  r: string;
  lat: number;
  lng: number;
};
type PoolEntry = { c: string; a: number };
type Silhouette = { d: string; vb: number };
type Guess = {
  code: string;
  name: string;
  pref: string;
  distKm: number;
  band: number;
  proximity: number;
  arrow: string;
  dirLabel: string;
  isCorrect: boolean;
};

const SHARE_URL = "https://ga-project.github.io/jichitai/";
const AREA_LABEL = [
  "",
  "とても小さい",
  "小さめ",
  "ふつう",
  "大きめ",
  "とても大きい",
];
const STORE_PREFIX = "jichitai:v1:";
const HELP_KEY = "jichitai:helpSeen";

// localStorage はプライベートモードやストレージ制限で例外を投げうるため安全に包む。
function lsGet(key: string): string | null {
  try {
    return typeof localStorage !== "undefined"
      ? localStorage.getItem(key)
      : null;
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    /* プライベートモード等の例外は無視 */
  }
}

function dataUrl(path: string): string {
  // basePath（/jichitai 等）配下でもルート配下でも正しく解決する。
  if (typeof document !== "undefined")
    return new URL(path, document.baseURI).toString();
  return path;
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${ss}`;
}

function jpDateLabel(date: Date): string {
  const parts = jstDateKey(date).split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const wd = ["日", "月", "火", "水", "木", "金", "土"];
  const wdIdx = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${y}年${m}月${d}日(${wd[wdIdx]})`;
}

function makeGuess(g: Muni, ans: Muni): Guess {
  const isCorrect = g.c === ans.c;
  const distKm = haversineKm(g.lat, g.lng, ans.lat, ans.lng);
  const dir = directionFor(bearingDeg(g.lat, g.lng, ans.lat, ans.lng));
  return {
    code: g.c,
    name: g.n,
    pref: g.p,
    distKm,
    band: proximityBand(distKm, isCorrect),
    proximity: proximityPct(distKm),
    arrow: dir.arrow,
    dirLabel: dir.label,
    isCorrect,
  };
}

export default function Home() {
  const [now, setNow] = useState<Date | null>(null);
  const [munis, setMunis] = useState<Muni[] | null>(null);
  const muniByCode = useRef<Map<string, Muni>>(new Map());
  const [answer, setAnswer] = useState<Muni | null>(null);
  const [answerArea, setAnswerArea] = useState<number>(3);
  const [sil, setSil] = useState<Silhouette | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Muni | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [listOpen, setListOpen] = useState(false);
  const [inputError, setInputError] = useState("");

  const [hintRegion, setHintRegion] = useState(false);
  const [hintPref, setHintPref] = useState(false);
  const [hintArea, setHintArea] = useState(false);

  const [showHelp, setShowHelp] = useState(false);
  const [toast, setToast] = useState("");
  const [countdown, setCountdown] = useState("");
  const liveRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const dateKey = now ? jstDateKey(now) : "";
  const pNumber = now ? puzzleNumber(now) : 0;

  // 起動: データ取得 → 当日のお題決定 → 進捗復元
  useEffect(() => {
    const n = new Date();
    setNow(n);
    setShowHelp(!lsGet(HELP_KEY));
    let cancelled = false;
    (async () => {
      try {
        const [mRes, pRes] = await Promise.all([
          fetch(dataUrl("data/municipalities.json")),
          fetch(dataUrl("data/pool.json")),
        ]);
        if (!mRes.ok || !pRes.ok) throw new Error("data fetch failed");
        const mList: Muni[] = await mRes.json();
        const pool: PoolEntry[] = await pRes.json();
        if (cancelled) return;
        const map = new Map<string, Muni>();
        for (const m of mList) map.set(m.c, m);
        muniByCode.current = map;
        setMunis(mList);

        const idx = answerIndex(n, pool.length);
        const entry = pool[idx];
        const ans = entry ? map.get(entry.c) : undefined;
        if (!ans) throw new Error("answer not found");
        setAnswer(ans);
        setAnswerArea(entry ? entry.a : 3);

        const sRes = await fetch(dataUrl(`data/sil/${ans.c}.json`));
        if (!sRes.ok) throw new Error("silhouette fetch failed");
        const sData: Silhouette = await sRes.json();
        if (cancelled) return;
        setSil(sData);

        // 進捗復元（当日キー）
        const saved = lsGet(STORE_PREFIX + jstDateKey(n));
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as {
              codes: string[];
              status: string;
            };
            const restored: Guess[] = [];
            for (const code of parsed.codes) {
              const g = map.get(code);
              if (g) restored.push(makeGuess(g, ans));
            }
            setGuesses(restored);
            if (parsed.status === "won" || parsed.status === "lost") {
              setStatus(parsed.status);
            }
          } catch {
            /* 壊れた保存は無視 */
          }
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // カウントダウン（次のJST0時まで）。
  // 開いたまま JST 日付を跨いだら当日のお題に切り替える（reload で再取得）。
  useEffect(() => {
    if (!now) return;
    const baseKey = jstDateKey(now);
    const tick = () => {
      const d = new Date();
      if (jstDateKey(d) !== baseKey) {
        if (typeof location !== "undefined") location.reload();
        return;
      }
      setCountdown(fmtCountdown(msUntilNextJstMidnight(d)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [now]);

  // モーダル: Esc で閉じる・初期フォーカス・簡易フォーカストラップ
  useEffect(() => {
    if (!showHelp) return;
    const node = modalRef.current;
    const focusables = node
      ? node.querySelectorAll<HTMLElement>(
          'a[href], button, [tabindex]:not([tabindex="-1"]), input, select, textarea',
        )
      : null;
    const first = focusables && focusables.length ? focusables[0] : null;
    const last =
      focusables && focusables.length
        ? focusables[focusables.length - 1]
        : null;
    (first ?? node)?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowHelp(false);
        lsSet(HELP_KEY, "1");
      } else if (e.key === "Tab" && first && last) {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showHelp]);

  const candidates = useMemo(() => {
    if (!munis) return [] as Muni[];
    return filterCandidates(query, munis, 6) as Muni[];
  }, [query, munis]);

  const persist = useCallback(
    (gs: Guess[], st: string) => {
      if (!dateKey) return;
      lsSet(
        STORE_PREFIX + dateKey,
        JSON.stringify({ codes: gs.map((g) => g.code), status: st }),
      );
    },
    [dateKey],
  );

  const alreadyGuessed = useCallback(
    (code: string) => guesses.some((g) => g.code === code),
    [guesses],
  );

  function chooseCandidate(m: Muni) {
    setSelected(m);
    setQuery(m.n);
    setListOpen(false);
    setActiveIndex(-1);
    setInputError("");
  }

  function commitGuess() {
    if (!answer || status !== "playing") return;
    // 候補から未選択でも、入力が完全一致 or 候補が1件なら自動的にそれを推測する。
    let target = selected;
    if (!target) {
      const q = query.trim();
      target =
        candidates.find((c) => c.n === q) ??
        (candidates.length === 1 ? candidates[0] : null) ??
        null;
    }
    if (!target) {
      setInputError("候補から市区町村を選んでください");
      return;
    }
    if (alreadyGuessed(target.c)) {
      setInputError("すでに推測済みです");
      return;
    }
    const g = makeGuess(target, answer);
    const next = [...guesses, g];
    setGuesses(next);
    setQuery("");
    setSelected(null);
    setListOpen(false);
    setInputError("");
    let st: "playing" | "won" | "lost" = "playing";
    if (g.isCorrect) st = "won";
    else if (next.length >= MAX_GUESSES) st = "lost";
    setStatus(st);
    persist(next, st);
    if (liveRef.current) {
      liveRef.current.textContent = g.isCorrect
        ? `正解！${g.name}`
        : `${g.name}、距離${Math.round(g.distKm)}キロ、方角${g.dirLabel}、近さ${g.proximity}パーセント`;
    }
  }

  function onInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (candidates.length) {
        setListOpen(true);
        setActiveIndex((i) => (i + 1) % candidates.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (candidates.length) {
        setListOpen(true);
        setActiveIndex((i) => (i <= 0 ? candidates.length - 1 : i - 1));
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (listOpen && activeIndex >= 0 && candidates[activeIndex]) {
        chooseCandidate(candidates[activeIndex]);
      } else if (selected && query === selected.n) {
        commitGuess();
      } else if (candidates.length === 1 && candidates[0]) {
        chooseCandidate(candidates[0]);
      } else {
        setInputError("候補から市区町村を選んでください");
      }
    } else if (e.key === "Escape") {
      setListOpen(false);
      setActiveIndex(-1);
    }
  }

  async function onShare() {
    const text = buildShareText(
      guesses.map((g) => ({
        band: g.band,
        arrow: g.arrow,
        isCorrect: g.isCorrect,
      })),
      { puzzleNumber: pNumber, won: status === "won", url: SHARE_URL },
    );
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      /* キャンセル等はコピーにフォールバック */
    }
    try {
      await navigator.clipboard.writeText(text);
      setToast("結果をコピーしました");
      setTimeout(() => setToast(""), 2000);
    } catch {
      setToast("コピーできませんでした");
      setTimeout(() => setToast(""), 2000);
    }
  }

  function dismissHelp() {
    setShowHelp(false);
    lsSet(HELP_KEY, "1");
  }

  const left = guessesLeft(guesses.length);
  // 入力があれば押せる。未選択でクリックした場合は commitGuess が完全一致/単一候補を
  // 自動解決し、解決できなければエラー表示する（ボタンが無反応に見える問題を回避）。
  const submitDisabled = status !== "playing" || !query.trim();

  return (
    <div className="jt-app">
      <a className="skip-link" href="#main">
        本文へスキップ
      </a>

      <header className="jt-header">
        <div className="jt-brand">
          <span className="jt-mark" aria-hidden="true">
            <span>市</span>
          </span>
          <div className="jt-titles">
            <h1 className="jt-title">ジチタイ</h1>
            <p className="jt-subtitle">
              {now ? `${jpDateLabel(now)} ・ #${pNumber}` : "　"}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="jt-iconbtn"
          aria-label="遊び方を見る"
          onClick={() => setShowHelp(true)}
        >
          ?
        </button>
      </header>

      <main
        id="main"
        tabIndex={-1}
        style={{ outline: "none", display: "contents" }}
      >
        {/* シルエット（今日のお題ステージ） */}
        <section
          className="jt-stage"
          aria-labelledby="sil-h"
        >
          <h2 id="sil-h" className="jt-visually-hidden">
            今日のシルエット
          </h2>
          <span className="jt-eyebrow">今日のお題</span>
          <div className="jt-silhouette-wrap">
            <div
              className={`jt-silhouette${status === "won" ? " is-correct" : ""}`}
            >
              {loadError ? (
                <div className="jt-stage-error" role="alert">
                  <span className="jt-stage-error-icon" aria-hidden="true">
                    !
                  </span>
                  <p>お題を読み込めませんでした。</p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      if (typeof location !== "undefined") location.reload();
                    }}
                  >
                    再読み込み
                  </button>
                </div>
              ) : sil ? (
                <svg
                  viewBox={`0 0 ${sil.vb} ${sil.vb}`}
                  role="img"
                  aria-label="今日の市区町村のシルエット"
                >
                  <path d={sil.d} />
                </svg>
              ) : (
                <div className="jt-skeleton" aria-label="本日のお題を準備中" />
              )}
            </div>
          </div>

          {/* ヒント（1段ずつ開示） */}
          {answer && status === "playing" && (
            <div className="jt-hints">
              <button
                type="button"
                className={`jt-hint${hintRegion ? " is-open" : ""}`}
                onClick={() => setHintRegion(true)}
                disabled={hintRegion}
              >
                {hintRegion ? `地方: ${answer.r}` : "地方を見る"}
              </button>
              <button
                type="button"
                className={`jt-hint${hintPref ? " is-open" : ""}`}
                onClick={() => setHintPref(true)}
                disabled={!hintRegion || hintPref}
              >
                {hintPref ? `都道府県: ${answer.p}` : "都道府県を見る"}
              </button>
              <button
                type="button"
                className={`jt-hint${hintArea ? " is-open" : ""}`}
                onClick={() => setHintArea(true)}
                disabled={!hintPref || hintArea}
              >
                {hintArea ? `面積: ${AREA_LABEL[answerArea]}` : "面積を見る"}
              </button>
            </div>
          )}
        </section>

        {/* 入力 */}
        {status === "playing" && !loadError && (
          <section className="jt-guess" aria-label="推測の入力">
            <div className="jt-inputrow">
              <input
                className={`jt-input${inputError ? " is-error" : ""}`}
                type="text"
                inputMode="text"
                autoComplete="off"
                role="combobox"
                aria-expanded={listOpen && candidates.length > 0}
                aria-controls="jt-listbox"
                aria-autocomplete="list"
                aria-activedescendant={
                  activeIndex >= 0 ? `jt-opt-${activeIndex}` : undefined
                }
                placeholder={munis ? "市区町村名を入力" : "読み込み中…"}
                value={query}
                disabled={!munis}
                aria-busy={!munis}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(null);
                  setListOpen(true);
                  setActiveIndex(-1);
                  setInputError("");
                }}
                onKeyDown={onInputKeyDown}
                onBlur={() => setListOpen(false)}
              />
              {listOpen && candidates.length > 0 && (
                <ul className="jt-listbox" id="jt-listbox" role="listbox">
                  {candidates.map((m, i) => (
                    <li
                      key={m.c}
                      id={`jt-opt-${i}`}
                      role="option"
                      aria-selected={i === activeIndex}
                      className="jt-option"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        chooseCandidate(m);
                      }}
                    >
                      <span>{m.n}</span>
                      <span className="pref">{m.p}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="jt-input-foot">
              {inputError ? (
                <p className="jt-errmsg" role="alert">
                  <span aria-hidden="true">⚠</span>
                  {inputError}
                </p>
              ) : (
                <span className="jt-tries">
                  残り
                  <span className="jt-pips" aria-hidden="true">
                    {Array.from({ length: MAX_GUESSES }).map((_, i) => (
                      <span
                        key={i}
                        className={`jt-pip${i < left ? " is-left" : ""}`}
                      />
                    ))}
                  </span>
                  {left}回
                </span>
              )}
            </div>
            <div aria-live="polite" className="jt-visually-hidden">
              {listOpen && query
                ? candidates.length > 0
                  ? `${candidates.length}件の候補`
                  : "候補なし"
                : ""}
            </div>
            <button
              type="button"
              className="btn btn-primary btn-lg jt-submit"
              onClick={commitGuess}
              disabled={submitDisabled}
            >
              推測する
            </button>
          </section>
        )}

        {/* aria-live: 推測結果の読み上げ */}
        <div ref={liveRef} aria-live="polite" className="jt-visually-hidden" />

        {/* 結果（読み上げは専用 live region に一本化。countdown の毎秒読み上げを避けるため
            この section には aria-live を付けない） */}
        {status !== "playing" && answer && (
          <section
            className={`jt-result${status === "won" ? " is-won" : ""}`}
          >
            <span className="jt-result-emoji" aria-hidden="true">
              {status === "won" ? "🎉" : "🗺️"}
            </span>
            <h2>
              {status === "won"
                ? `正解！ ${answer.n}`
                : `正解は ${answer.n}`}
            </h2>
            <p className="jt-result-sub">
              {status === "won"
                ? `${guesses.length}回で当たりました ・ ${answer.p}・${answer.r}`
                : `${answer.p}・${answer.r} ・ また明日チャレンジ！`}
            </p>
            <p className="jt-countdown">
              次のお題まで <b>{countdown}</b>
            </p>
          </section>
        )}

        {/* 推測履歴（6行ぶん確保・CLS防止） */}
        <section aria-label="推測の履歴">
          <ol className="jt-history">
            {Array.from({ length: MAX_GUESSES }).map((_, i) => {
              const g = guesses[i];
              if (!g) {
                return (
                  <li key={i} className="jt-row empty" aria-hidden="true" />
                );
              }
              return (
                <li
                  key={i}
                  className={`jt-row p${g.band}`}
                  aria-label={`${g.name}、距離${Math.round(g.distKm)}キロ、方角${g.dirLabel}、近さ${g.proximity}パーセント`}
                >
                  <div className="jt-row-top">
                    <span className="name">{g.name}</span>
                    <span className="dist">
                      {g.isCorrect ? "0km" : `${Math.round(g.distKm)}km`}
                    </span>
                    <span className="dir" aria-hidden="true">
                      {g.isCorrect ? "⭐" : g.arrow}
                      <span className="dirlabel">
                        {g.isCorrect ? "正解" : g.dirLabel}
                      </span>
                    </span>
                  </div>
                  <div className="jt-bar">
                    <span
                      className={`bar${g.band}`}
                      style={{ width: `${g.proximity}%` }}
                    />
                  </div>
                  <div className="jt-prox">近さ {g.proximity}%</div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* 共有 */}
        {status !== "playing" && (
          <section>
            <button
              type="button"
              className="btn btn-primary btn-lg jt-submit"
              onClick={onShare}
            >
              <span aria-hidden="true">📤</span>
              結果を共有する
            </button>
          </section>
        )}
      </main>

      <footer className="jt-footer">
        <p style={{ margin: 0 }}>
          「国土数値情報（行政区域データ）」（国土交通省）を加工して作成
        </p>
      </footer>

      {/* オンボーディング / ヘルプ */}
      {showHelp && (
        <div
          className="jt-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-h"
          onClick={dismissHelp}
        >
          <div
            className="jt-modal"
            ref={modalRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="help-h">遊び方</h2>
            <ol>
              <li>
                今日の市区町村の<strong>シルエット</strong>を見る
              </li>
              <li>
                市区町村名を入力して<strong>推測する</strong>
              </li>
              <li>
                <strong>距離・方角・近さ</strong>
                のヒントを頼りに、6回以内で当てる
              </li>
            </ol>
            <p>正解までの「近さ」の色:</p>
            <div className="jt-legend">
              <span>
                <span
                  className="swatch"
                  style={{ background: "var(--prox-5)" }}
                />
                正解／極近
              </span>
              <span>
                <span
                  className="swatch"
                  style={{ background: "var(--prox-4)" }}
                />
                とても近い
              </span>
              <span>
                <span
                  className="swatch"
                  style={{ background: "var(--prox-3)" }}
                />
                近い
              </span>
              <span>
                <span
                  className="swatch"
                  style={{ background: "var(--prox-2)" }}
                />
                やや遠い
              </span>
              <span>
                <span
                  className="swatch"
                  style={{ background: "var(--prox-1)" }}
                />
                遠い
              </span>
            </div>
            <p>方角は矢印（↑北 ↗北東 →東 …）で、正解の方向を指します。</p>
            <button
              type="button"
              className="btn btn-primary btn-lg jt-modal-cta"
              onClick={dismissHelp}
            >
              はじめる
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="jt-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
