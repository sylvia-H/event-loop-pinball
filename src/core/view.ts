// 時間 → 畫面。viewAt(run, t) 是純函式：在 states[k] 與 states[k+1] 之間內插，
// 沒有累積狀態，所以時間軸往回拖就是倒著演。整數 t 直接由該狀態算出，不經過內插。

import {
  ARM_REST,
  HUB,
  immediateSlot,
  MACRO,
  macroSlot,
  microSlot,
  PICKUP_DEG,
  SLOT_DEG,
  STACK,
  stackSlot,
  tickSlot,
  TIMER_DROP_DEG,
  timerSlot,
  type Pt,
} from './geometry.ts';
import { LANES, type BallView, type Lane, type MachineState, type MachineView, type Run, type Step } from './types.ts';

/** 機器的範圍（geometry.ts 開頭的說明）：彈珠的中心不會超出去 */
const BOUND = { x: 7.2, y: 4.2 };

/** 被機械臂夾走的那一步的時間分配：伸過去 → 夾著移到主管口 → 放手，彈珠自己落進主管 */
const REACH = 0.15;
const CARRY = 0.6;
/** 計時器到期的那一步：前段從掛勾落到外圈，後段沿外圈滑進隊伍 */
const FALL = 0.4;
/** 執行完的彈珠往上彈出主管口之後再飛多遠 */
const EXIT_RISE = 0.5;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => {
  const c = clamp01(v);
  return c * c * (3 - 2 * c);
};
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const mixPt = (a: Pt, b: Pt, p: number): Pt => ({ x: mix(a.x, b.x, p), y: mix(a.y, b.y, p) });
const inBounds = (p: Pt): Pt => ({
  x: Math.min(BOUND.x, Math.max(-BOUND.x, p.x)),
  y: Math.min(BOUND.y, Math.max(-BOUND.y, p.y)),
});

/** 各管線第 i 個位置；i 可以帶小數（隊伍往前遞補時沿著軌道滑，不抄近路） */
const SLOT: Record<Lane, (i: number) => Pt> = {
  stack: stackSlot,
  micro: microSlot,
  macro: macroSlot,
  tick: tickSlot,
  immediate: immediateSlot,
  timers: timerSlot,
};

const macroAt = (deg: number): Pt => ({
  x: HUB.x + MACRO.rx * Math.cos((deg * Math.PI) / 180),
  y: HUB.y + MACRO.ry * Math.sin((deg * Math.PI) / 180),
});

interface Place {
  lane: Lane;
  index: number;
}

/** 某個狀態裡每顆彈珠在哪條管線的第幾個 */
function places(state: MachineState): Map<string, Place> {
  const out = new Map<string, Place>();
  const put = (lane: Lane, ids: readonly string[]) => ids.forEach((id, index) => out.set(id, { lane, index }));
  put('stack', state.stack);
  put('micro', state.micro);
  put('macro', state.macro);
  put('tick', state.tick);
  put('immediate', state.immediate);
  put(
    'timers',
    state.timers.map((t) => t.ball),
  );
  return out;
}

const occupied = (state: MachineState, lane: Lane): number =>
  (lane === 'timers' ? state.timers.length : state[lane].length) > 0 ? 1 : 0;

/** 每顆計時器彈珠一開始掛上去時的毫秒數（剩餘比例的分母）。只是快取，不影響結果 */
const totalsCache = new WeakMap<Run, Map<string, number>>();
function timerTotals(run: Run): Map<string, number> {
  let totals = totalsCache.get(run);
  if (!totals) {
    totals = new Map();
    for (const state of run.states) {
      for (const t of state.timers) totals.set(t.ball, Math.max(totals.get(t.ball) ?? 0, t.remaining));
    }
    totalsCache.set(run, totals);
  }
  return totals;
}

function timerRatios(run: Run, state: MachineState): Map<string, number> {
  const totals = timerTotals(run);
  const out = new Map<string, number>();
  for (const t of state.timers) {
    const total = totals.get(t.ball) ?? 0;
    out.set(t.ball, total > 0 ? clamp01(t.remaining / total) : 0);
  }
  return out;
}

/** 整數時間：就是 states[k] 本身 */
function still(run: Run, k: number): MachineView {
  const state = run.states[k]!;
  const at = places(state);
  const balls: BallView[] = [];
  for (const ball of Object.values(run.balls)) {
    const p = at.get(ball.id);
    if (!p) continue;
    const pos = inBounds(SLOT[p.lane](p.index));
    balls.push({ id: ball.id, kind: ball.kind, label: ball.label, x: pos.x, y: pos.y, alpha: 1, scale: 1, glow: 0, lane: p.lane });
  }
  const lit = {} as Record<Lane, number>;
  for (const lane of LANES) lit[lane] = occupied(state, lane);
  return {
    balls,
    lit,
    arm: { x: ARM_REST.x, y: ARM_REST.y, grip: 0, lit: 0 },
    outputCount: state.output.length,
    timerLeft: Object.fromEntries(timerRatios(run, state)),
  };
}

/** 被機械臂夾走的彈珠在這一步的位置：取球點 → 主管口上方 → 落進主管 */
function grabbedAt(from: Pt, to: Pt, u: number): Pt {
  if (u <= REACH) return from;
  if (u <= CARRY) return mixPt(from, STACK.mouth, smooth((u - REACH) / (CARRY - REACH)));
  const fall = clamp01((u - CARRY) / (1 - CARRY));
  return mixPt(STACK.mouth, to, fall * fall);
}

/** 這一步碰到哪些管線 */
function touched(step: Step): Set<Lane> {
  const out = new Set<Lane>();
  for (const ev of step.events) {
    if (ev.type === 'spawn') out.add(ev.to);
    else if (ev.type === 'move') out.add(ev.from).add(ev.to);
    else if (ev.type === 'pop' || ev.type === 'log') out.add('stack');
    else out.add('timers');
  }
  return out;
}

/** 第 k 步進行到 u（0 < u < 1） */
function between(run: Run, k: number, u: number): MachineView {
  const step = run.steps[k]!;
  const prev = run.states[k]!;
  const next = run.states[k + 1]!;
  const from = places(prev);
  const to = places(next);
  const e = smooth(u);
  const bump = Math.sin(Math.PI * u);

  const moves = new Map<string, Lane>();
  const active = new Set<string>();
  let logged = false;
  for (const ev of step.events) {
    if (ev.type === 'move') moves.set(ev.ball, ev.from);
    if (ev.type === 'move' || ev.type === 'spawn' || ev.type === 'pop') active.add(ev.ball);
    if (ev.type === 'log') logged = true;
  }
  // 印出一行的是主管最上面那一顆
  const runner = logged ? prev.stack[prev.stack.length - 1] : undefined;

  let arm = { x: ARM_REST.x, y: ARM_REST.y, grip: 0, lit: 0 };
  const balls: BallView[] = [];
  for (const ball of Object.values(run.balls)) {
    const a = from.get(ball.id);
    const b = to.get(ball.id);
    if (!a && !b) continue;
    let pos: Pt;
    let alpha = 1;
    let scale = 1;
    let lane: Lane;

    if (a && b) {
      lane = b.lane;
      const start = SLOT[a.lane](a.index);
      const end = SLOT[b.lane](b.index);
      if (moves.has(ball.id) && b.lane === 'stack') {
        pos = grabbedAt(start, end, u);
        if (u <= REACH) {
          const p = smooth(u / REACH);
          arm = { ...mixPt(ARM_REST, start, p), grip: p, lit: bump };
        } else if (u <= CARRY) {
          arm = { x: pos.x, y: pos.y, grip: 1, lit: bump };
        } else {
          const p = (u - CARRY) / (1 - CARRY);
          arm = { ...mixPt(STACK.mouth, ARM_REST, smooth(p)), grip: 1 - smooth(p * 2.5), lit: bump };
        }
      } else if (moves.has(ball.id) && a.lane === 'timers' && b.lane === 'macro') {
        if (u <= FALL) {
          const p = u / FALL;
          pos = mixPt(start, macroAt(TIMER_DROP_DEG), p * p);
        } else {
          const target = PICKUP_DEG - b.index * SLOT_DEG.macro;
          pos = macroAt(mix(TIMER_DROP_DEG, target, smooth((u - FALL) / (1 - FALL))));
        }
      } else if (a.lane === b.lane) {
        pos = SLOT[a.lane](mix(a.index, b.index, e));
      } else {
        pos = mixPt(start, end, e);
      }
    } else if (b) {
      // 新排進來的：在自己的位置上浮現；直接進主管的從管口落下
      lane = b.lane;
      const end = SLOT[b.lane](b.index);
      pos = b.lane === 'stack' ? mixPt(STACK.mouth, end, e) : end;
      alpha = smooth(u / 0.4);
      scale = mix(0.3, 1, alpha);
    } else {
      // 執行完：從主管口往上彈出並淡出
      lane = 'stack';
      const start = SLOT[a!.lane](a!.index);
      const out = { x: STACK.mouth.x, y: STACK.mouth.y + EXIT_RISE };
      pos = u <= 0.5 ? mixPt(start, STACK.mouth, smooth(u / 0.5)) : mixPt(STACK.mouth, out, (u - 0.5) / 0.5);
      alpha = 1 - smooth((u - 0.4) / 0.6);
      scale = mix(1, 0.7, e);
    }

    if (alpha <= 0) continue;
    pos = inBounds(pos);
    const glow = active.has(ball.id) || ball.id === runner ? bump : 0;
    balls.push({ id: ball.id, kind: ball.kind, label: ball.label, x: pos.x, y: pos.y, alpha, scale, glow, lane });
  }

  const hit = touched(step);
  const lit = {} as Record<Lane, number>;
  for (const lane of LANES) {
    const base = mix(occupied(prev, lane), occupied(next, lane), e);
    lit[lane] = clamp01(Math.max(base, hit.has(lane) ? bump : 0));
  }

  // 還掛在架上的才有倒數；倒數是時間，線性走，不做緩動
  const before = timerRatios(run, prev);
  const timerLeft: Record<string, number> = {};
  for (const [id, ratio] of timerRatios(run, next)) timerLeft[id] = mix(before.get(id) ?? ratio, ratio, u);

  return {
    balls,
    lit,
    arm,
    outputCount: (u >= 0.5 ? next : prev).output.length,
    timerLeft,
  };
}

/** t ∈ [0, run.steps.length]，可帶小數；超出範圍會被夾住 */
export function viewAt(run: Run, t: number): MachineView {
  const n = run.steps.length;
  const tc = Number.isNaN(t) ? 0 : Math.min(n, Math.max(0, t));
  const k = Math.floor(tc);
  const u = tc - k;
  return u === 0 ? still(run, k) : between(run, k, u);
}

/** 每顆彈珠牽涉到哪些程式碼行：它被排進去的那一行，加上它在主管最上面時執行過的每一行 */
const linesCache = new WeakMap<Run, Map<string, number[]>>();
function ballLines(run: Run): Map<string, number[]> {
  let map = linesCache.get(run);
  if (map) return map;
  const sets = new Map<string, Set<number>>();
  const add = (id: string | undefined, line: number | null) => {
    if (id === undefined || line === null || !run.balls[id]) return;
    let set = sets.get(id);
    if (!set) sets.set(id, (set = new Set()));
    set.add(line);
  };
  for (const ball of Object.values(run.balls)) add(ball.id, ball.line);
  run.steps.forEach((step, k) => {
    // 這一步是誰在跑：做之前主管最上面那顆；主管是空的（機械臂正要夾一顆進來）就看做完之後
    const top = (stack: readonly string[]) => stack[stack.length - 1];
    add(top(run.states[k]!.stack) ?? top(run.states[k + 1]!.stack), step.line);
  });
  map = new Map();
  for (const [id, set] of sets) map.set(id, [...set].sort((x, y) => x - y));
  linesCache.set(run, map);
  return map;
}

/** 滑到程式碼某一行時要發亮的彈珠 */
export function ballsForLine(run: Run, line: number): string[] {
  const lines = ballLines(run);
  return Object.keys(run.balls).filter((id) => lines.get(id)?.includes(line));
}

/** 點到某顆彈珠時要標出來的程式碼行（由小到大） */
export function linesForBall(run: Run, ballId: string): number[] {
  return [...(ballLines(run).get(ballId) ?? [])];
}
