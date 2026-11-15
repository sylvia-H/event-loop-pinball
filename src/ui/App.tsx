import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { cartridges } from '../cartridges/index.ts';
import { runFreePlay, type Shot } from '../core/freeplay.ts';
import type { BallKind, Cartridge, Run } from '../core/types.ts';
import { ballsForLine, linesForBall } from '../core/view.ts';
import { Stage } from '../scene/stage.ts';
import { CartridgeList } from './CartridgeList.tsx';
import { CodePanel } from './CodePanel.tsx';
import { Guess, guessable } from './Guess.tsx';
import { Guide, GUIDE_ID } from './Guide.tsx';
import { Launcher } from './Launcher.tsx';
import { Explain, Question } from './Lesson.tsx';
import { OutputPanel } from './OutputPanel.tsx';
import { Timeline } from './Timeline.tsx';
import { createClock, prefersReducedMotion } from './clock.ts';
import { createStore } from './store.ts';
import { S } from './strings.ts';

const STEP_MS = 600;
const PLAY_MS = 800;
const SNAP_MS = 200;
const MAX_SHOTS = 24;
const GUIDE_KEY = 'event-loop-pinball:guide-seen';
const FREE = 'free';

type Mode = 'cart' | 'free';

interface Route {
  mode: Mode;
  /** 卡匣模式才有意義 */
  slug: string;
  t: number;
}

/** `#/<slug>`、`#/<slug>?t=3.5`、`#/free`。認不得的 slug 與沒有 hash 都落到第一個卡匣。 */
function parseRoute(hash: string): Route {
  const m = /^#\/([^?]*)(?:\?(.*))?$/.exec(hash);
  let name = m?.[1] ?? '';
  try {
    name = decodeURIComponent(name);
  } catch {
    // 壞掉的 % 編碼：當成認不得的 slug
  }
  if (name === FREE) return { mode: 'free', slug: '', t: 0 };
  const entry = cartridges.find((c) => c.slug === name) ?? cartridges[0];
  const t = Number(new URLSearchParams(m?.[2] ?? '').get('t'));
  return { mode: 'cart', slug: entry?.slug ?? '', t: Number.isFinite(t) && t > 0 ? t : 0 };
}

const stepIndex = (t: number) => (t <= 0 ? -1 : Math.ceil(t) - 1);

const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? 'auto' : 'smooth');

/** 每一行輸出是哪一種彈珠印的：印出那一步開始時主管最上面那一顆 */
function printers(run: Run): BallKind[] {
  const out: BallKind[] = [];
  run.steps.forEach((step, k) => {
    const top = run.states[k]?.stack.at(-1);
    for (const ev of step.events) if (ev.type === 'log') out.push(run.balls[top ?? '']?.kind ?? 'sync');
  });
  return out;
}

/** 第一次造訪回傳 true，並記下來；之後回傳 false。 */
function firstVisit(): boolean {
  try {
    if (localStorage.getItem(GUIDE_KEY)) return false;
    localStorage.setItem(GUIDE_KEY, '1');
  } catch {
    // 讀寫不了 localStorage（隱私模式、被停用）：當成第一次
  }
  return true;
}

export function App() {
  // t 的熱路徑：機器與滑桿直接訂閱 store，Preact 只在步驟索引改變時重繪
  const store = useMemo(() => createStore(0), []);
  const clock = useMemo(() => createClock(store), [store]);

  const [route, setRoute] = useState(() => parseRoute(location.hash));
  const [cart, setCart] = useState<Cartridge | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [shots, setShots] = useState<Shot[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  /** 正在進行的步驟（ceil(t) - 1）；-1 是還沒開始 */
  const [idx, setIdx] = useState(-1);
  /** 已經做完幾步（floor(t)）：輸出面板用它，印出的那一步做完才出現 */
  const [done, setDone] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [hot, setHot] = useState<ReadonlySet<number> | null>(null);
  const [predicted, setPredicted] = useState<string[] | null>(null);
  const [guessRound, setGuessRound] = useState(0);
  const [guideOpen, setGuideOpen] = useState(firstVisit);
  /** 這次造訪展開過解說的卡匣（slug）：換卡匣再回來時維持展開 */
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const explainRef = useRef<HTMLElement>(null);
  /** 下一次畫完要把解說／說明捲進左欄的可視範圍（只在剛展開的那一刻，回到已展開的卡匣不捲） */
  const scrollToExplain = useRef(false);
  const scrollToGuide = useRef(false);
  const stageRef = useRef<Stage | null>(null);
  /** 機器已經收過 setRun：在那之前不對它呼叫 setT */
  const stageLoaded = useRef(false);
  const runRef = useRef<Run | null>(null);
  const modeRef = useRef<Mode>(route.mode);
  const lastSlug = useRef(route.slug);
  const shotsRef = useRef<Shot[]>([]);
  const freeRunRef = useRef<Run | null>(null);
  const cache = useRef(new Map<string, Cartridge>());
  const playTimer = useRef(0);

  const total = () => runRef.current?.steps.length ?? 0;

  /** t 變了：機器、滑桿直接改；步驟索引變了才會真的觸發 Preact 重繪 */
  const onT = (t: number) => {
    if (stageLoaded.current) stageRef.current?.setT(t);
    const slider = sliderRef.current;
    if (slider && Number(slider.value) !== t) slider.value = String(t);
    setIdx(stepIndex(t));
    setDone(Math.floor(t));
  };

  const stop = () => {
    clock.cancel();
    clearTimeout(playTimer.current);
    setPlaying(false);
  };

  /** 換一份 Run（卡匣載入、發球、清空）。機器不重建。 */
  const applyRun = (next: Run | null, t: number) => {
    runRef.current = next;
    setRun(next);
    const stage = stageRef.current;
    if (next && stage) {
      stage.setRun(next);
      stageLoaded.current = true;
    }
    const clamped = next ? Math.min(Math.max(t, 0), next.steps.length) : 0;
    store.set(clamped);
    // t 沒變時 store 不會通知，但 Run 換了，畫面還是要重算
    onT(clamped);
  };

  const goTo = (target: number, ms: number) => {
    stop();
    clock.to(Math.min(Math.max(target, 0), total()), ms);
  };

  const prev = () => goTo(Math.ceil(store.get()) - 1, STEP_MS);
  const next = () => goTo(Math.floor(store.get()) + 1, STEP_MS);

  const playOn = () => {
    const t = store.get();
    const end = total();
    if (t >= end) {
      setPlaying(false);
      return;
    }
    const target = Math.min(Math.floor(t) + 1, end);
    if (prefersReducedMotion()) {
      // 不做補間，但仍一步一步走，否則「播放」會直接跳到結尾
      playTimer.current = window.setTimeout(() => {
        store.set(target);
        playOn();
      }, PLAY_MS);
    } else {
      clock.to(target, PLAY_MS * (target - t), playOn);
    }
  };

  /** 從目前的 t 一路播到底 */
  const play = () => {
    stop();
    if (store.get() >= total()) return;
    setPlaying(true);
    playOn();
  };

  const togglePlay = () => {
    if (playing) {
      stop();
      return;
    }
    if (total() === 0) return;
    if (store.get() >= total()) store.set(0);
    play();
  };

  const highlight = (ids: readonly string[] | null) =>
    stageRef.current?.setHighlight(ids && ids.length > 0 ? new Set(ids) : null);

  // ── 自己發球 ──

  const freeRun = (): Run => (freeRunRef.current ??= runFreePlay(shotsRef.current));

  const setFreeShots = (nextShots: Shot[], t: number) => {
    shotsRef.current = nextShots;
    freeRunRef.current = runFreePlay(nextShots);
    setShots(nextShots);
    applyRun(freeRunRef.current, t);
  };

  const fire = (kind: string) => {
    if (shotsRef.current.length >= MAX_SHOTS) return;
    stop();
    const t = store.get();
    // 這顆球在「目前這一步做完」時進機器；機器閒置（t 在最後）時就是總步數
    setFreeShots([...shotsRef.current, { kind, atStep: Math.ceil(t) }], t);
    play();
  };

  const clearShots = () => {
    stop();
    setFreeShots([], 0);
  };

  // ── 路由 ──

  const selectCart = (slug: string) => {
    location.hash = `#/${slug}`;
  };

  const selectMode = (mode: Mode) => {
    if (mode === modeRef.current) return;
    location.hash = mode === 'free' ? `#/${FREE}` : `#/${lastSlug.current || (cartridges[0]?.slug ?? '')}`;
  };

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash));
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  // 機器：只建一次，換卡匣、換玩法都不重建
  useEffect(() => {
    const canvas = canvasRef.current;
    const labels = labelsRef.current;
    if (!canvas || !labels) return;
    let stage: Stage;
    try {
      stage = new Stage(canvas, labels, {
        onHover(id) {
          const current = runRef.current;
          if (id && current) {
            highlight([id]);
            setHot(modeRef.current === 'cart' ? new Set(linesForBall(current, id)) : null);
          } else {
            highlight(null);
            setHot(null);
          }
        },
      });
    } catch {
      setGlFailed(true);
      return;
    }
    stageRef.current = stage;
    return () => {
      stage.dispose();
      stageRef.current = null;
      stageLoaded.current = false;
    };
  }, []);

  useEffect(() => store.subscribe(onT), [store]);

  // 路由 → 目前的 Run
  useEffect(() => {
    stop();
    highlight(null);
    setHot(null);
    setPredicted(null);
    setGuessRound((n) => n + 1);
    modeRef.current = route.mode;

    if (route.mode === 'free') {
      // 回到自己發球：機器停在跑完的樣子，下一顆接在最後面
      const free = freeRun();
      applyRun(free, free.steps.length);
      return;
    }

    lastSlug.current = route.slug;
    const entry = cartridges.find((c) => c.slug === route.slug);
    const cached = cache.current.get(route.slug);
    if (cached) {
      setCart(cached);
      applyRun(cached.run, route.t);
      return;
    }
    setLoadFailed(false);
    applyRun(null, 0);
    if (!entry) return;
    let alive = true;
    entry.load().then(
      (loaded) => {
        cache.current.set(loaded.slug, loaded);
        if (!alive) return;
        setCart(loaded);
        applyRun(loaded.run, route.t);
      },
      () => {
        if (alive) setLoadFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [route, reload]);

  // Run 換了之後滑桿的 max 才更新：這時再把值寫回去，否則會被舊的 max 夾住
  useLayoutEffect(() => {
    const slider = sliderRef.current;
    if (slider) slider.value = String(store.get());
  }, [run]);

  // 鍵盤：← → 走一步、Esc 收合說明
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') {
        if (guideOpen) setGuideOpen(false);
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      const onSlider = el === sliderRef.current;
      if (!onSlider && el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      if (e.key === 'ArrowLeft') prev();
      else next();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  useEffect(
    () => () => {
      clock.cancel();
      clearTimeout(playTimer.current);
    },
    [clock],
  );

  // ── 畫面 ──

  const mode = route.mode;
  const shownCart = mode === 'cart' && cart?.slug === route.slug ? cart : null;
  const steps = run?.steps.length ?? 0;
  const step = run && idx >= 0 ? run.steps[idx] : undefined;
  const outCount = run?.states[Math.min(done, run.states.length - 1)]?.output.length ?? 0;
  const pickable = useMemo(() => {
    const lines = new Set<number>();
    for (const s of shownCart?.run.steps ?? []) if (s.line !== null) lines.add(s.line);
    return lines;
  }, [shownCart]);

  const outKinds = useMemo(() => (mode === 'free' && run ? printers(run) : null), [mode, run]);

  // ── 解說：球跑完（t 到底）自動展開，也可以提前按開 ──

  const isRevealed = shownCart !== null && revealed.has(shownCart.slug);
  const showExplain = () =>
    explainRef.current?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
  const reveal = () => {
    if (!shownCart || isRevealed) return;
    scrollToExplain.current = true;
    setRevealed(new Set(revealed).add(shownCart.slug));
  };

  // run 要是這個卡匣自己的：從自己發球切回來的那一瞬間，done 還是上一份 Run 的
  const finished = shownCart !== null && run === shownCart.run && steps > 0 && done >= steps;
  useEffect(() => {
    if (finished) reveal();
  }, [finished, shownCart]);

  useEffect(() => {
    if (!isRevealed || !scrollToExplain.current) return;
    scrollToExplain.current = false;
    showExplain();
  }, [isRevealed, shownCart]);

  const toggleGuide = (scroll: boolean) => {
    scrollToGuide.current = scroll && !guideOpen;
    setGuideOpen(!guideOpen);
  };

  useEffect(() => {
    if (!guideOpen || !scrollToGuide.current) return;
    scrollToGuide.current = false;
    document.getElementById(GUIDE_ID)?.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
  }, [guideOpen]);

  /** 印出第 i 行（0 起算）的那一步做完的時間 */
  const jumpToLine = (i: number) => {
    const at = runRef.current?.states.findIndex((s) => s.output.length > i) ?? -1;
    if (at >= 0) goTo(at, STEP_MS);
  };

  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const to: Mode = e.key === 'Home' ? 'cart' : e.key === 'End' ? 'free' : mode === 'cart' ? 'free' : 'cart';
    selectMode(to);
    document.getElementById(`tab-${to}`)?.focus();
  };

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      id={`tab-${m}`}
      class={'tab' + (mode === m ? ' is-selected' : '')}
      role="tab"
      aria-selected={mode === m}
      aria-controls="mode-panel"
      tabIndex={mode === m ? 0 : -1}
      onClick={() => selectMode(m)}
    >
      {label}
    </button>
  );

  return (
    <div class="shell">
      <header class="top">
        <h1 class="brand">{S.brand}</h1>
        <button
          type="button"
          class="btn btn-guide"
          aria-expanded={guideOpen}
          aria-controls={GUIDE_ID}
          onClick={() => toggleGuide(true)}
        >
          {S.guide.button}
        </button>
      </header>

      <main class="page">
        <div class="side">
          <Guide open={guideOpen} onToggle={() => toggleGuide(false)} />

          <div class="tabs" role="tablist" aria-label={S.mode.label} onKeyDown={onTabKey}>
            {tab('cart', S.mode.cart)}
            {tab('free', S.mode.free)}
          </div>

          <div id="mode-panel" class="mode-panel" role="tabpanel" aria-labelledby={`tab-${mode}`}>
            {mode === 'cart' ? (
              <>
                <CartridgeList entries={cartridges} selected={route.slug} onSelect={selectCart} />
                {shownCart ? (
                  <>
                    <Question cart={shownCart} revealed={isRevealed} onReveal={isRevealed ? showExplain : reveal} />
                    <CodePanel
                      code={shownCart.code}
                      note={S.code.verified(shownCart.verified.node)}
                      current={step?.line ?? null}
                      hot={hot}
                      pickable={pickable}
                      onEnter={(line) => highlight(ballsForLine(shownCart.run, line))}
                      onLeave={() => highlight(null)}
                      onPick={(line) => {
                        const i = shownCart.run.steps.findIndex((s) => s.line === line);
                        if (i >= 0) goTo(i + 1, STEP_MS);
                      }}
                    />
                    {guessable(shownCart.run.output) && predicted === null && (
                      <Guess
                        key={`${shownCart.slug}:${guessRound}`}
                        output={shownCart.run.output}
                        seed={shownCart.slug}
                        hidden={idx >= 0}
                        onSubmit={(order) => {
                          setPredicted(order);
                          stop();
                          store.set(0);
                          play();
                        }}
                      />
                    )}
                  </>
                ) : loadFailed ? (
                  <p class="notice" role="alert">
                    {S.list.failed}
                    <button type="button" class="btn" onClick={() => setReload(reload + 1)}>
                      {S.list.retry}
                    </button>
                  </p>
                ) : (
                  <p class="notice">{S.list.loading}</p>
                )}
              </>
            ) : (
              <Launcher count={shots.length} max={MAX_SHOTS} onFire={fire} onClear={clearShots} />
            )}

            <OutputPanel
              lines={run?.output ?? []}
              count={outCount}
              kinds={outKinds}
              predicted={mode === 'cart' ? predicted : null}
              onJump={jumpToLine}
              onGuessAgain={() => {
                setPredicted(null);
                setGuessRound(guessRound + 1);
                goTo(0, 0);
              }}
            />

            {isRevealed && shownCart && <Explain cart={shownCart} boxRef={explainRef} />}
          </div>
        </div>

        <div class="main">
          <section class="stage" aria-label={S.stage.label}>
            <div class="stage-view" hidden={glFailed}>
              <canvas ref={canvasRef} aria-hidden="true" />
              <div class="labels" ref={labelsRef} aria-hidden="true" />
            </div>
            {glFailed && <p class="stage-fallback">{S.stage.fallback}</p>}
          </section>

          <Timeline
            steps={steps}
            idx={idx}
            step={step}
            idle={mode === 'cart' ? S.timeline.idleCart : S.timeline.idleFree}
            playing={playing}
            sliderRef={sliderRef}
            onScrub={(t) => {
              stop();
              store.set(t);
            }}
            onRelease={() => goTo(Math.round(store.get()), SNAP_MS)}
            onPrev={prev}
            onNext={next}
            onTogglePlay={togglePlay}
          />
        </div>
      </main>
    </div>
  );
}
