import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runFreePlay } from './freeplay.ts';
import {
  ARM_IDLE_GRIP_R,
  ARM_REST,
  BALL_R,
  HUB,
  macroSlot,
  microSlot,
  STACK,
  stackSlot,
  TICK,
  tickSlot,
  timerSlot,
} from './geometry.ts';
import { async_, await_, block, call, immediate, log, nextTick, program, then_, timeout } from './program.ts';
import { simulate } from './sim.ts';
import { LANES, type Lane, type MachineState, type Run } from './types.ts';
import { ballsForLine, linesForBall, viewAt } from './view.ts';

const classic = simulate(program(log(1, 1), timeout(2, 0, [log(2, 2)]), then_(3, [log(3, 3)]), log(4, 4)));
const everything = simulate(
  program(
    call(1, 'f', [log(2, 'f')]),
    timeout(3, 100, [log(3, 't'), immediate(4, [log(4, 'i')]), timeout(5, 0, [log(5, 't2')])]),
    timeout(6, 100, [log(6, 'u')]),
    nextTick(7, [log(7, 'n')]),
    async_(8, 'g', [await_(9), log(10, 'g2')]),
    block(11, 30),
  ),
);
// 故意打很多顆：隊伍繞外圈超過一圈、計時器架掛滿，座標也不能跑出機器
const crowded = runFreePlay([
  { kind: 'timeoutThen', atStep: 0 },
  { kind: 'click', atStep: 0 },
  { kind: 'microChain', atStep: 2 },
  { kind: 'timeout1s', atStep: 3 },
  ...Array.from({ length: 40 }, (_, i) => ({ kind: i % 2 ? 'timeout1s' : 'click', atStep: 4 })),
]);
const RUNS: [string, Run][] = [
  ['經典題', classic],
  ['全部的管線', everything],
  ['自己發球（很多顆）', crowded],
];

const REST = { x: ARM_REST.x, y: ARM_REST.y, grip: 0, lit: 0 };

test('閒置的夾爪收在超車道圓的內側：不壓到軌道、軸心，也不壓到超車道上排隊的彈珠', () => {
  const d = Math.hypot(ARM_REST.x - HUB.x, ARM_REST.y - HUB.y);
  // 外緣離超車道的線、內緣離軸心的外環（半徑 0.2）都留一點空隙
  assert.ok(d + ARM_IDLE_GRIP_R < TICK.r - 0.05, '夾爪壓到超車道的線');
  assert.ok(d - ARM_IDLE_GRIP_R > 0.3, '夾爪壓到軸心');
  // 超車道排到第 6 顆才會繞到夾爪這裡（卡匣最多同時 2 顆，自己發球沒有 nextTick）
  for (let i = 0; i < 5; i++) {
    const p = tickSlot(i);
    const gap = Math.hypot(p.x - ARM_REST.x, p.y - ARM_REST.y) - BALL_R - ARM_IDLE_GRIP_R;
    assert.ok(gap > 0.1, `夾爪太靠近超車道第 ${i} 顆`);
  }
});
const ids = (s: MachineState, lane: Lane) => (lane === 'timers' ? s.timers.map((t) => t.ball) : s[lane]);
const xy = (p: { x: number; y: number }) => ({ x: p.x, y: p.y });

for (const [name, run] of RUNS) {
  test(`${name}：整數 t 與該狀態嚴格一致`, () => {
    run.states.forEach((state, k) => {
      const view = viewAt(run, k);
      assert.deepEqual(view.balls.map((b) => b.id).sort(), LANES.flatMap((l) => ids(state, l)).sort());
      for (const b of view.balls) {
        assert.equal(b.alpha, 1);
        assert.equal(b.scale, 1);
        assert.equal(b.glow, 0);
        assert.equal(b.lane, LANES.find((l) => ids(state, l).includes(b.id)));
        assert.equal(b.kind, run.balls[b.id]!.kind);
        assert.equal(b.label, run.balls[b.id]!.label);
      }
      for (const lane of LANES) assert.equal(view.lit[lane], ids(state, lane).length > 0 ? 1 : 0);
      assert.deepEqual(view.arm, REST);
      assert.equal(view.outputCount, state.output.length);
      assert.deepEqual(Object.keys(view.timerLeft).sort(), ids(state, 'timers').sort());
    });
  });

  test(`${name}：純函式，呼叫順序不影響結果，也不會改到 run`, () => {
    const frozen = JSON.stringify(run);
    const ts = Array.from({ length: run.steps.length * 8 + 1 }, (_, i) => i / 8);
    const forward = ts.map((t) => viewAt(run, t));
    const backward = [...ts]
      .reverse()
      .map((t) => viewAt(run, t))
      .reverse();
    assert.deepEqual(backward, forward);
    assert.deepEqual(viewAt(run, 1.37), viewAt(run, 1.37));
    // 快取不影響結果：內容相同的另一份 Run 得到相同的畫面
    const copy = JSON.parse(frozen) as Run;
    assert.deepEqual(viewAt(copy, 2.6), viewAt(run, 2.6));
    assert.equal(JSON.stringify(run), frozen);
  });

  test(`${name}：t 超界會被夾住`, () => {
    const n = run.steps.length;
    assert.deepEqual(viewAt(run, -5), viewAt(run, 0));
    assert.deepEqual(viewAt(run, n + 100), viewAt(run, n));
    assert.deepEqual(viewAt(run, Infinity), viewAt(run, n));
    assert.deepEqual(viewAt(run, NaN), viewAt(run, 0));
  });

  test(`${name}：任何 t 的數值都在範圍內`, () => {
    const n = run.steps.length;
    for (let i = 0; i <= n * 40; i++) {
      const t = i / 40;
      const view = viewAt(run, t);
      for (const b of view.balls) {
        assert.ok(Math.abs(b.x) <= 7.2 && Math.abs(b.y) <= 4.2, `t=${t} ${b.id} 跑出機器：(${b.x}, ${b.y})`);
        for (const v of [b.alpha, b.scale, b.glow]) assert.ok(v >= 0 && v <= 1, `t=${t} ${b.id} 的數值超出 0..1`);
        assert.ok(b.alpha > 0);
      }
      for (const lane of LANES) assert.ok(view.lit[lane] >= 0 && view.lit[lane] <= 1);
      assert.ok(Math.abs(view.arm.x) <= 7.2 && Math.abs(view.arm.y) <= 4.2);
      assert.ok(view.arm.grip >= 0 && view.arm.grip <= 1 && view.arm.lit >= 0 && view.arm.lit <= 1);
      for (const v of Object.values(view.timerLeft)) assert.ok(v >= 0 && v <= 1);
      assert.ok(view.outputCount >= 0 && view.outputCount <= run.output.length);
    }
  });

  test(`${name}：整數時間點的兩側接得上，不會跳`, () => {
    const n = run.steps.length;
    const eps = 1e-4;
    for (let k = 0; k <= n; k++) {
      const at = viewAt(run, k);
      for (const side of [k - eps, k + eps]) {
        if (side < 0 || side > n) continue;
        const near = viewAt(run, side);
        for (const b of at.balls) {
          const nb = near.balls.find((x) => x.id === b.id);
          assert.ok(nb, `t=${k} 附近 ${b.id} 不見了`);
          assert.ok(Math.hypot(nb.x - b.x, nb.y - b.y) < 0.02, `t=${k} 附近 ${b.id} 的位置跳了`);
        }
        // 另一側多出來的只能是剛要浮現、或已經淡到看不見的
        for (const nb of near.balls) {
          if (!at.balls.some((b) => b.id === nb.id)) assert.ok(nb.alpha < 0.01, `t=${k} 附近 ${nb.id} 突然出現或消失`);
        }
        for (const lane of LANES) {
          assert.ok(Math.abs(near.lit[lane] - at.lit[lane]) < 0.01, `t=${k} 附近 ${lane} 的亮度跳了`);
        }
        assert.ok(Math.hypot(near.arm.x - at.arm.x, near.arm.y - at.arm.y) < 0.02);
        assert.ok(near.arm.grip < 0.01 && near.arm.lit < 0.01);
      }
    }
  });
}

test('整數 t 的座標就是 geometry 的位置', () => {
  const k = classic.states.findIndex((s) => s.timers.length && s.micro.length && s.stack.length);
  assert.ok(k >= 0);
  const state = classic.states[k]!;
  const view = viewAt(classic, k);
  const at = (id: string) => xy(view.balls.find((b) => b.id === id)!);
  assert.deepEqual(at(state.stack[0]!), stackSlot(0));
  assert.deepEqual(at(state.micro[0]!), microSlot(0));
  assert.deepEqual(at(state.timers[0]!.ball), timerSlot(0));
  const m = classic.states.findIndex((s) => s.macro.length);
  assert.deepEqual(xy(viewAt(classic, m).balls.find((b) => b.id === classic.states[m]!.macro[0])!), macroSlot(0));
});

test('沒用到的管線 lit 恆為 0，用到的管線一定亮過', () => {
  for (const [name, run] of RUNS) {
    const used = new Set<Lane>();
    for (const s of run.states) for (const l of LANES) if (ids(s, l).length) used.add(l);
    const peak = Object.fromEntries(LANES.map((l) => [l, 0])) as Record<Lane, number>;
    for (let i = 0; i <= run.steps.length * 20; i++) {
      const view = viewAt(run, i / 20);
      for (const l of LANES) peak[l] = Math.max(peak[l], view.lit[l]);
    }
    for (const l of LANES) {
      if (used.has(l)) assert.equal(peak[l], 1, `${name}：${l} 用到了卻沒亮`);
      else assert.equal(peak[l], 0, `${name}：${l} 沒用到卻亮了`);
    }
  }
  assert.deepEqual(
    LANES.filter((l) => everything.states.some((s) => ids(s, l).length)),
    LANES,
  );
  // 經典題用不到 Node 專屬的兩條
  for (let i = 0; i <= classic.steps.length * 20; i++) {
    const { lit } = viewAt(classic, i / 20);
    assert.equal(lit.tick, 0);
    assert.equal(lit.immediate, 0);
  }
  // 只有同步的程式：只有主管亮，機械臂從頭到尾不動
  const sync = simulate(program(log(1, 1), call(2, 'f', [log(3, 2)])));
  for (let i = 0; i <= sync.steps.length * 20; i++) {
    const view = viewAt(sync, i / 20);
    for (const l of LANES) if (l !== 'stack') assert.equal(view.lit[l], 0);
    assert.deepEqual(view.arm, REST);
  }
});

test('機械臂夾球的那一步：夾著彈珠經過主管口上方，其餘的步停在原位', () => {
  let grabs = 0;
  classic.steps.forEach((step, k) => {
    const grab = step.events.find((e) => e.type === 'move' && e.to === 'stack');
    if (!grab || grab.type !== 'move') {
      for (const u of [0.2, 0.5, 0.8]) assert.deepEqual(viewAt(classic, k + u).arm, REST);
      return;
    }
    grabs++;
    const ballAt = (u: number) => viewAt(classic, k + u).balls.find((b) => b.id === grab.ball)!;
    const mid = viewAt(classic, k + 0.4);
    assert.equal(mid.arm.grip, 1);
    assert.ok(mid.arm.lit > 0.5);
    assert.deepEqual(xy(mid.arm), xy(ballAt(0.4)));
    assert.equal(ballAt(0.4).lane, 'stack');
    assert.ok(ballAt(0.4).glow > 0.5);
    // 一開始還在隊伍的取球點，機械臂伸過去
    assert.deepEqual(xy(ballAt(0.05)), xy(ballAt(0)));
    // 放手的那一刻彈珠在主管口上方，之後落進主管
    assert.ok(Math.hypot(ballAt(0.6).x - STACK.mouth.x, ballAt(0.6).y - STACK.mouth.y) < 1e-9);
    assert.equal(ballAt(0.8).x, STACK.x);
    assert.ok(ballAt(0.8).y < STACK.mouth.y && ballAt(0.8).y > ballAt(1).y);
    assert.deepEqual(xy(ballAt(1)), stackSlot(0));
  });
  assert.equal(grabs, 2);
});

test('計時器到期：從掛勾落到外圈，再沿外圈滑進隊伍', () => {
  const k = classic.steps.findIndex((s) => s.events.some((e) => e.type === 'move' && e.from === 'timers'));
  const id = classic.states[k]!.timers[0]!.ball;
  const at = (u: number) => viewAt(classic, k + u).balls.find((b) => b.id === id)!;
  assert.deepEqual(xy(at(0)), timerSlot(0));
  assert.deepEqual(xy(at(1)), macroSlot(0));
  assert.equal(at(0.5).lane, 'macro');
  assert.ok(at(0.2).y < at(0).y);
  // 後段每一點都在外圈的橢圓上
  for (const u of [0.4, 0.55, 0.7, 0.85]) {
    const p = at(u);
    const r = ((p.x - 1.4) / 4.5) ** 2 + ((p.y + 0.2) / 3.0) ** 2;
    assert.ok(Math.abs(r - 1) < 1e-9, `u=${u} 不在外圈上`);
  }
  assert.deepEqual(viewAt(classic, k + 0.3).arm, REST);
});

test('執行完的彈珠從主管口往上彈出並淡出；新呼叫的函式從管口落進主管', () => {
  const run = simulate(program(call(1, 'f', [])));
  const k = run.steps.findIndex((s) => s.events.some((e) => e.type === 'pop'));
  const id = run.states[k]!.stack[1]!;
  const at = (t: number) => viewAt(run, t).balls.find((b) => b.id === id);
  assert.ok(at(k + 0.5)!.y > at(k)!.y);
  assert.ok(at(k + 0.9)!.y > STACK.mouth.y);
  assert.ok(at(k + 0.9)!.alpha < at(k + 0.5)!.alpha);
  assert.equal(at(k + 1), undefined);
  // 進來的那一步
  assert.equal(at(k - 1), undefined);
  assert.ok(at(k - 0.5)!.y > at(k)!.y);
  assert.equal(at(k - 0.5)!.x, STACK.x);
});

test('outputCount 在 log 那一步的中點之後才加一', () => {
  const k = classic.steps.findIndex((s) => s.events.some((e) => e.type === 'log'));
  assert.equal(viewAt(classic, k + 0.49).outputCount, 0);
  assert.equal(viewAt(classic, k + 0.51).outputCount, 1);
  assert.equal(viewAt(classic, classic.steps.length).outputCount, 4);
});

test('timerLeft：掛上去是滿的，等的時候線性倒數到 0', () => {
  const run = simulate(program(timeout(1, 100, []), timeout(2, 400, [])));
  const k = run.steps.findIndex((s) => s.events[0]?.type === 'wait');
  const [a, b] = run.states[k]!.timers.map((t) => t.ball) as [string, string];
  assert.deepEqual(viewAt(run, k).timerLeft, { [a]: 1, [b]: 1 });
  const half = viewAt(run, k + 0.5).timerLeft;
  assert.ok(Math.abs(half[a]! - 0.5) < 1e-9);
  assert.ok(Math.abs(half[b]! - 0.875) < 1e-9);
  assert.deepEqual(viewAt(run, k + 1).timerLeft, { [a]: 0, [b]: 0.75 });
  // 掉上外圈之後就不在架上了
  assert.deepEqual(Object.keys(viewAt(run, k + 2).timerLeft), [b]);
  // 0 毫秒的計時器一掛上去就是 0
  const zero = simulate(program(timeout(1, 0, [])));
  assert.deepEqual(Object.values(viewAt(zero, 2).timerLeft), [0]);
});

test('隊伍前面的被拿走，後面的沿著軌道往前遞補', () => {
  const run = simulate(program(then_(1, []), then_(2, []), then_(3, [])));
  const k = run.steps.findIndex((s) => s.events.some((e) => e.type === 'move'));
  const second = run.states[k]!.micro[1]!;
  const at = (t: number) => xy(viewAt(run, t).balls.find((b) => b.id === second)!);
  assert.deepEqual(at(k), microSlot(1));
  assert.deepEqual(at(k + 1), microSlot(0));
  const mid = at(k + 0.5);
  assert.deepEqual(mid, microSlot(0.5));
});

test('ballsForLine 與 linesForBall 互相一致', () => {
  for (const [, run] of RUNS) {
    const all = Object.keys(run.balls);
    for (let line = 0; line <= 14; line++) {
      const balls = ballsForLine(run, line);
      for (const id of all) assert.equal(linesForBall(run, id).includes(line), balls.includes(id));
    }
    for (const id of all) {
      const lines = linesForBall(run, id);
      assert.deepEqual(lines, [...new Set(lines)].sort((p, q) => p - q));
      for (const line of lines) assert.ok(ballsForLine(run, line).includes(id));
    }
  }
  assert.deepEqual(linesForBall(classic, '不存在'), []);
  assert.deepEqual(ballsForLine(classic, 99), []);
  // 回傳的陣列改了也不影響下一次
  linesForBall(classic, 'main').push(99);
  assert.deepEqual(linesForBall(classic, 'main'), [1, 2, 3, 4]);
});

test('經典題的行與彈珠：主程式對到每一行，回呼對到自己那一行', () => {
  const by = (label: string) => Object.values(classic.balls).find((b) => b.label === label)!.id;
  assert.deepEqual(linesForBall(classic, 'main'), [1, 2, 3, 4]);
  assert.deepEqual(linesForBall(classic, by('timeout 0ms')), [2]);
  assert.deepEqual(linesForBall(classic, by('then')), [3]);
  assert.deepEqual(ballsForLine(classic, 2), ['main', by('timeout 0ms')]);
  assert.deepEqual(ballsForLine(classic, 4), ['main']);
});

test('函式裡的行對到那個函式的彈珠，不是呼叫它的人', () => {
  const run = simulate(program(log(4, 1), call(5, 'greet', [log(2, 2)]), log(6, 3)));
  const greet = Object.values(run.balls).find((b) => b.label === 'greet')!.id;
  assert.deepEqual(ballsForLine(run, 2), [greet]);
  assert.deepEqual(linesForBall(run, greet), [2, 5]);
  assert.deepEqual(linesForBall(run, 'main'), [4, 5, 6]);
});

test('自己發球沒有程式碼：沒有任何行對到彈珠', () => {
  for (const id of Object.keys(crowded.balls)) assert.deepEqual(linesForBall(crowded, id), []);
});

test('空的 Run 也能畫', () => {
  const view = viewAt(runFreePlay([]), 0.5);
  assert.deepEqual(view.balls, []);
  assert.deepEqual(view.arm, REST);
  assert.equal(view.outputCount, 0);
  assert.deepEqual(view.timerLeft, {});
  for (const l of LANES) assert.equal(view.lit[l], 0);
});
