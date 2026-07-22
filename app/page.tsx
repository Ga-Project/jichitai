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
  dayNumber,
  puzzleNumber,
  answerIndex,
  msUntilNextJstMidnight,
  filterCandidates,
  guessesLeft,
} from "@/lib/game.mjs";
import { buildShareText } from "@/lib/share.mjs";
import {
  emptyStats,
  parseStats,
  recordResult,
  serializeStats,
  currentStreak,
  winRatePct,
  distMax,
} from "@/lib/stats.mjs";

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
// 版番号はキーではなく保存値の中に持つ（キーに載せると版を上げた瞬間に
// 旧キーが読まれなくなり、連続記録が全部消える）。
const STATS_KEY = "jichitai:stats";
type ModalKind = "help" | "stats";

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
/** 保存できたら true。保存できない環境ではその旨を画面に出すため成否を返す。 */
function lsSet(key: string, value: string): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false; // プライベートモード・容量超過など
  }
}

/**
 * 決着を戦績に書き込む。記録の正は保存値なので、画面の状態ではなく保存値を
 * 読み直してから記録する（別タブが先に記録していても古い値を書き戻さない）。
 * 決着が確定した箇所から結果を直接渡す形にして、複数の state を突き合わせない。
 */
function persistDecision(day: number, won: boolean, guessCount: number) {
  const before = parseStats(lsGet(STATS_KEY));
  const next = recordResult(before, { day, won, guessCount });
  return {
    next,
    saved: lsSet(STATS_KEY, serializeStats(next)),
    isNewRecord: next.maxStreak > before.maxStreak,
  };
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
  // 年は毎日同じで情報量が無く、狭い画面では「第N号」を押し出してしまうので出さない
  // （第N号は共有テキストの #N と対になる識別子なので、こちらを必ず残す）。
  return `${m}/${d}(${wd[wdIdx]})`;
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

  const [modal, setModal] = useState<ModalKind | null>(null);
  const [stats, setStats] = useState(emptyStats);
  const [statsSaved, setStatsSaved] = useState(true);
  const [newRecord, setNewRecord] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const recordedDay = useRef<number | null>(null);
  const [resultOpen, setResultOpen] = useState(true);
  const [toast, setToast] = useState("");
  const [countdown, setCountdown] = useState("");
  const liveRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const dateKey = now ? jstDateKey(now) : "";
  const pNumber = now ? puzzleNumber(now) : 0;

  // 起動: データ取得 → 当日のお題決定 → 進捗復元
  useEffect(() => {
    const n = new Date();
    setNow(n);
    setModal(lsGet(HELP_KEY) ? null : "help");
    setStats(parseStats(lsGet(STATS_KEY)));
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
              // 同じ日の決着は二重に数えない（recordResult 側でも弾かれる）。
              const day = dayNumber(n);
              if (recordedDay.current !== day) {
                recordedDay.current = day;
                const r = persistDecision(
                  day,
                  parsed.status === "won",
                  restored.length,
                );
                setStats(r.next);
                setStatsSaved(r.saved);
                // 復元は「今更新した」わけではないので自己最高の演出はしない。
                setNewRecord(false);
              }
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

  // 勝敗が確定したら結果オーバーレイを開く（再訪時も）。
  useEffect(() => {
    if (status !== "playing") setResultOpen(true);
  }, [status]);

  // 消去の確認状態はモーダルを開閉するたびに戻す（次に開いた時に確認済みで待たない）。
  useEffect(() => {
    setResetArmed(false);
  }, [modal]);

  // モーダル: Esc で閉じる・初期フォーカス・簡易フォーカストラップ・閉じたら発火元へ復帰
  useEffect(() => {
    if (!modal) return;
    // 開く前のフォーカス位置を控え、閉じたときに戻す（毎日開く導線なので、
    // キーボード・スクリーンリーダーで HUD の位置を見失わせない）。
    const opener =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
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
    // 最初のフォーカス可能要素（＝最下部の CTA）ではなく、モーダル本体に当てる。
    // CTA に当てると開いた瞬間に見出しの外までスクロールし、読み上げも末尾から始まる。
    node?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (modal === "help") lsSet(HELP_KEY, "1");
        setModal(null);
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
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && opener.isConnected) opener.focus();
    };
  }, [modal]);

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
    // 決着したら、この場で確定した結果をそのまま戦績へ渡す。
    if (st !== "playing" && now) {
      const day = dayNumber(now);
      if (recordedDay.current !== day) {
        recordedDay.current = day;
        const r = persistDecision(day, st === "won", next.length);
        setStats(r.next);
        setStatsSaved(r.saved);
        setNewRecord(r.isNewRecord);
      }
    }
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
      {
        puzzleNumber: pNumber,
        won: status === "won",
        url: SHARE_URL,
        streak: liveStreak,
      },
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
    setModal(null);
    lsSet(HELP_KEY, "1");
  }

  // 記録の消去。1回目の押下で確認に変わり、2回目で実行する（誤爆防止）。
  // 端末の時計が先に進んだ状態で記録されると以後その日数に追いつくまで記録が
  // 止まるため、ユーザー自身が復旧できる唯一の手段でもある。
  function resetStats() {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    const cleared = emptyStats();
    setStatsSaved(lsSet(STATS_KEY, serializeStats(cleared)));
    setStats(cleared);
    setNewRecord(false);
    recordedDay.current = null;
    setResetArmed(false);
    setToast("記録を消しました");
    setTimeout(() => setToast(""), 2000);
  }

  const left = guessesLeft(guesses.length);
  // 連続日数は保存値をそのまま出さず、今つながっているかを毎回判定して出す。
  const liveStreak = now ? currentStreak(stats, dayNumber(now)) : 0;
  const rate = winRatePct(stats);
  const barBase = distMax(stats);
  // 今回の結果を分布のどの行にハイライトするか（勝った時だけ）。
  const todayRow = status === "won" ? guesses.length : 0;
  // 入力があれば押せる。未選択でクリックした場合は commitGuess が完全一致/単一候補を
  // 自動解決し、解決できなければエラー表示する（ボタンが無反応に見える問題を回避）。
  const submitDisabled = status !== "playing" || !query.trim();

  // ヒントの開示段（コンパス座標として段階表示する）。
  const hintRows: {
    key: string;
    label: string;
    open: boolean;
    value: string;
  }[] = answer
    ? [
        { key: "r", label: "地方", open: hintRegion, value: answer.r },
        { key: "p", label: "都道府県", open: hintPref, value: answer.p },
        {
          key: "a",
          label: "面積",
          open: hintArea,
          value: AREA_LABEL[answerArea] ?? "ふつう",
        },
      ]
    : [];

  return (
    <div className="gp-field">
      <a className="skip-link" href="#console">
        推測の入力へスキップ
      </a>

      {/* ===== 上段 HUD: 探索ログのヘッダ計器（日付・お題番号・残量メーター） ===== */}
      <header className="gp-hud">
        <div className="gp-hud-id">
          <span className="gp-mark" aria-hidden="true">
            <span>市</span>
          </span>
          <div className="gp-hud-titles">
            <h1 className="gp-wordmark">ジチタイ</h1>
            <p className="gp-coord" aria-hidden={now ? undefined : "true"}>
              {now ? (
                <>
                  <span className="gp-coord-part">{jpDateLabel(now)}・</span>
                  <span className="gp-coord-part">第{pNumber}号</span>
                </>
              ) : (
                "　"
              )}
            </p>
          </div>
        </div>

        <div className="gp-hud-right">
          {/* 残り回数メーター（HUD の計器として常時表示） */}
          <div
            className="gp-meter"
            aria-label={`残り推測 ${left} / ${MAX_GUESSES} 回`}
          >
            <span className="gp-meter-pips" aria-hidden="true">
              {Array.from({ length: MAX_GUESSES }).map((_, i) => (
                <span
                  key={i}
                  className={`gp-meter-pip${i < left ? " is-left" : " is-used"}`}
                />
              ))}
            </span>
            <span className="gp-meter-num" aria-hidden="true">
              {left}
            </span>
          </div>
          <button
            type="button"
            className={`gp-iconbtn gp-logbtn${liveStreak > 0 ? " has-streak" : ""}`}
            aria-label={
              liveStreak > 0
                ? `探検記録を見る（連続発見${liveStreak}日）`
                : "探検記録を見る"
            }
            onClick={() => setModal("stats")}
          >
            <span aria-hidden="true">📊</span>
            {liveStreak > 0 && (
              <span className="gp-logbtn-streak" aria-hidden="true">
                {liveStreak}
              </span>
            )}
          </button>
          <button
            type="button"
            className="gp-iconbtn"
            aria-label="遊び方を見る"
            onClick={() => setModal("help")}
          >
            ?
          </button>
        </div>
      </header>

      {/* ===== 中段 STAGE: 盤面が主役。地図プレート＋コンパス座標枠 ===== */}
      <main id="board" className="gp-stage" tabIndex={-1}>
        <h2 className="jt-visually-hidden">今日のシルエット</h2>

        {/* 地図プレート（コンパス十字の中心に据える） */}
        <div className="gp-plate-frame">
          <span className="gp-compass gp-compass-n" aria-hidden="true">
            北
          </span>
          <span className="gp-compass gp-compass-s" aria-hidden="true">
            南
          </span>
          <span className="gp-compass gp-compass-w" aria-hidden="true">
            西
          </span>
          <span className="gp-compass gp-compass-e" aria-hidden="true">
            東
          </span>

          <div
            className={`gp-plate${status === "won" ? " is-correct" : ""}${status === "lost" ? " is-revealed" : ""}`}
          >
            {loadError ? (
              <div className="gp-plate-error" role="alert">
                <span className="gp-plate-error-icon" aria-hidden="true">
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

        {/* コンパス座標の段階開示（ヒント）。盤面直下の計器列。 */}
        {answer && status === "playing" && (
          <div className="gp-hintrail" aria-label="座標ヒント">
            {hintRows.map((h, i) => {
              const prevOpen =
                i === 0 ? true : (hintRows[i - 1]?.open ?? false);
              const disabled = !prevOpen || h.open;
              const onOpen = () => {
                if (h.key === "r") setHintRegion(true);
                else if (h.key === "p") setHintPref(true);
                else setHintArea(true);
              };
              return (
                <button
                  key={h.key}
                  type="button"
                  className={`gp-coordbtn${h.open ? " is-open" : ""}`}
                  onClick={onOpen}
                  disabled={disabled}
                >
                  <span className="gp-coord-label">{h.label}</span>
                  <span className="gp-coord-val">
                    {h.open ? h.value : "▦ ▦ ▦"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* aria-live: 推測結果の読み上げ（専用 live region に一本化） */}
        <div ref={liveRef} aria-live="polite" className="jt-visually-hidden" />

        {/* 結果オーバーレイ（盤面の上に重ねる。ページに section を挿し込まない） */}
        {status !== "playing" && answer && resultOpen && (
          <div className="gp-result-overlay" role="status">
            <div className={`gp-result${status === "won" ? " is-won" : ""}`}>
              <span className="gp-result-emoji" aria-hidden="true">
                {status === "won" ? "🎉" : "🗺️"}
              </span>
              <h2 className="gp-result-title">
                {status === "won" ? `正解！ ${answer.n}` : `正解は ${answer.n}`}
              </h2>
              <p className="gp-result-sub">
                {status === "won"
                  ? `${guesses.length}回で発見 ・ ${answer.p}・${answer.r}`
                  : `${answer.p}・${answer.r} ・ また明日チャレンジ！`}
              </p>
              <button
                type="button"
                className={`gp-streak${liveStreak >= 2 ? " is-lit" : ""}`}
                onClick={() => setModal("stats")}
              >
                <span aria-hidden="true">{liveStreak >= 1 ? "🔥" : "🧭"}</span>
                {liveStreak >= 2
                  ? `${liveStreak}日連続発見${newRecord ? "・自己最長記録" : ""}`
                  : liveStreak === 1
                    ? "連続1日目 — 明日つづけば2日連続"
                    : stats.maxStreak > 0
                      ? `連続が途切れました（最長 ${stats.maxStreak}日）`
                      : "探検記録をひらく"}
              </button>
              <div className="gp-result-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  onClick={onShare}
                >
                  <span aria-hidden="true">📤</span>
                  結果を共有
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setResultOpen(false)}
                >
                  盤面を見る
                </button>
              </div>
              <p className="gp-countdown" aria-live="off">
                次のお題まで <b>{countdown}</b>
              </p>
            </div>
          </div>
        )}

        {/* 結果を閉じている時、再表示する小タブ */}
        {status !== "playing" && answer && !resultOpen && (
          <button
            type="button"
            className="gp-result-reopen"
            onClick={() => setResultOpen(true)}
          >
            結果を表示
          </button>
        )}
      </main>

      {/* ===== 下段 CONSOLE: 探索トレイル（履歴）＋ 入力コマンドバー ===== */}
      <section id="console" className="gp-console" aria-label="推測コンソール">
        {/* 探索トレイル: 推測の足跡を横に並べる。6 枠ぶん確保し CLS を防ぐ。 */}
        <ol className="gp-trail" aria-label="推測の履歴">
          {Array.from({ length: MAX_GUESSES }).map((_, i) => {
            const g = guesses[i];
            if (!g) {
              return (
                <li key={i} className="gp-stamp empty" aria-hidden="true">
                  <span className="gp-stamp-no">{i + 1}</span>
                </li>
              );
            }
            return (
              <li
                key={i}
                className={`gp-stamp p${g.band}`}
                aria-label={`${g.name}、距離${Math.round(g.distKm)}キロ、方角${g.dirLabel}、近さ${g.proximity}パーセント`}
              >
                <span className="gp-stamp-head">
                  <span className="gp-stamp-name">{g.name}</span>
                  <span className="gp-stamp-arrow" aria-hidden="true">
                    {g.isCorrect ? "⭐" : g.arrow}
                  </span>
                </span>
                <span className="gp-stamp-dist">
                  {g.isCorrect ? "0km" : `${Math.round(g.distKm)}km`}
                  <span className="gp-stamp-dir" aria-hidden="true">
                    {g.isCorrect ? "正解" : g.dirLabel}
                  </span>
                </span>
                <span className="gp-stamp-ring" aria-hidden="true">
                  <span
                    className={`gp-stamp-fill bar${g.band}`}
                    style={{ width: `${g.proximity}%` }}
                  />
                </span>
                <span className="gp-stamp-prox" aria-hidden="true">
                  近さ {g.proximity}%
                </span>
              </li>
            );
          })}
        </ol>

        {/* 入力コマンドバー（盤面下に常駐） */}
        {status === "playing" && !loadError && (
          <div className="gp-command">
            <div className="gp-cmd-row">
              <div className="gp-inputwrap">
                <input
                  ref={inputRef}
                  className={`gp-input${inputError ? " is-error" : ""}`}
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={listOpen && candidates.length > 0}
                  aria-controls="gp-listbox"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    activeIndex >= 0 ? `gp-opt-${activeIndex}` : undefined
                  }
                  aria-label="市区町村名を入力して推測"
                  placeholder={munis ? "市区町村名で探索…" : "読み込み中…"}
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
                  <ul className="gp-listbox" id="gp-listbox" role="listbox">
                    {candidates.map((m, i) => (
                      <li
                        key={m.c}
                        id={`gp-opt-${i}`}
                        role="option"
                        aria-selected={i === activeIndex}
                        className="gp-option"
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
              <button
                type="button"
                className="btn btn-primary gp-fire"
                onClick={commitGuess}
                disabled={submitDisabled}
              >
                推測
              </button>
            </div>
            <div className="gp-cmd-foot">
              {inputError ? (
                <p className="gp-errmsg" role="alert">
                  <span aria-hidden="true">⚠</span>
                  {inputError}
                </p>
              ) : (
                <span className="gp-hint-text">
                  残り{left}回・距離と方角を頼りに当てよう
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
          </div>
        )}

        {/* 終了後の共有導線（コンソール内・盤面下） */}
        {status !== "playing" && (
          <div className="gp-command gp-command-done">
            <button
              type="button"
              className="btn btn-primary gp-fire-full"
              onClick={onShare}
            >
              <span aria-hidden="true">📤</span>
              結果を共有する
            </button>
          </div>
        )}

        <p className="gp-source">
          「国土数値情報（行政区域データ）」（国土交通省）を加工して作成
        </p>
      </section>

      {/* ===== 戦績（連続記録・正解率・推測回数の分布） ===== */}
      {modal === "stats" && (
        <div
          className="jt-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stats-h"
          onClick={() => setModal(null)}
        >
          <div
            className="jt-modal"
            ref={modalRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="stats-h">探検記録</h2>

            {!statsSaved && (
              <p className="gp-stats-warn" role="alert">
                この環境では記録を保存できません（ブラウザのプライベートモードや
                保存の制限が原因のことがあります）。表示は今回ぶんだけです。
              </p>
            )}

            {stats.played === 0 ? (
              <div className="gp-stats-empty">
                {/* 何が貯まるのかを実物の形で先に見せる */}
                <dl className="gp-stats-grid is-ghost" aria-hidden="true">
                  {["探検日数", "発見率", "連続発見", "最長連続"].map((l) => (
                    <div className="gp-stat" key={l}>
                      <dt>{l}</dt>
                      <dd>–</dd>
                    </div>
                  ))}
                </dl>
                <p>
                  まだ記録がありません。今日のお題に挑戦すると、ここに連続発見と発見率が貯まっていきます。
                </p>
                <p className="gp-stats-note">
                  記録はこの端末にだけ保存されます。ブラウザの閲覧データを消すと記録も消えます。
                </p>
              </div>
            ) : (
              <>
                <dl className="gp-stats-grid">
                  <div className="gp-stat">
                    <dt>探検日数</dt>
                    <dd>
                      {stats.played}
                      <small>日</small>
                    </dd>
                  </div>
                  <div className="gp-stat">
                    <dt>発見率</dt>
                    <dd>
                      {rate}
                      <small>%</small>
                    </dd>
                  </div>
                  <div className="gp-stat is-streak">
                    <dt>連続発見</dt>
                    <dd>
                      {liveStreak}
                      <small>日</small>
                    </dd>
                    {/* 連鎖の長さを数字だけでなくピップ列でも示す（HUD 残量計器と同じ語彙） */}
                    <span className="gp-stat-pips" aria-hidden="true">
                      {Array.from({ length: Math.min(liveStreak, 7) }).map(
                        (_, i) => (
                          <span key={i} className="gp-stat-pip" />
                        ),
                      )}
                      {liveStreak > 7 && (
                        <span className="gp-stat-more">+{liveStreak - 7}</span>
                      )}
                    </span>
                  </div>
                  <div className="gp-stat">
                    <dt>最長連続</dt>
                    <dd>
                      {stats.maxStreak}
                      <small>日</small>
                    </dd>
                  </div>
                </dl>

                <h3 className="gp-stats-sub">何回目で見つけたか</h3>
                <ol
                  className="gp-dist"
                  aria-label="見つけるまでにかかった推測回数の分布"
                >
                  {stats.dist.map((count, i) => {
                    const isToday = todayRow === i + 1;
                    return (
                      <li
                        key={i}
                        className={`gp-dist-row${count > 0 ? " has-count" : ""}${isToday ? " is-today" : ""}`}
                        aria-current={isToday ? "true" : undefined}
                      >
                        <span className="gp-dist-no" aria-hidden="true">
                          {i + 1}
                        </span>
                        <span className="gp-dist-track">
                          <span
                            className="gp-dist-bar"
                            style={{
                              width: count ? `${(count / barBase) * 100}%` : 0,
                            }}
                          />
                        </span>
                        <span className="gp-dist-count">
                          <span className="jt-visually-hidden">
                            {i + 1}回で見つけた日:
                          </span>
                          {count}
                          <span className="jt-visually-hidden">日</span>
                        </span>
                        {/* 今日の行は色以外でも分かるようにラベルと太い罫で示す */}
                        {isToday && <span className="gp-dist-today">今日</span>}
                      </li>
                    );
                  })}
                </ol>
                <p className="gp-stats-note">
                  記録はこの端末にだけ保存されます。ブラウザの閲覧データを消すと記録も消えます。
                  <button
                    type="button"
                    className="gp-stats-reset"
                    onClick={resetStats}
                  >
                    {resetArmed ? "本当に消す" : "記録を消す"}
                  </button>
                </p>
              </>
            )}

            <button
              type="button"
              className="btn btn-primary btn-lg jt-modal-cta"
              onClick={() => setModal(null)}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* ===== オンボーディング / ヘルプ ===== */}
      {modal === "help" && (
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
            <ol className="jt-steps">
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
