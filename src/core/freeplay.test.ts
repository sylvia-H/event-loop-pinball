import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runFreePlay, SHOTS, type Shot } from './freeplay.ts';
import { LANES, type Lane, type Run } from './types.ts';

const chars = (s: string) => [...s].length;
const shots = (...list: [string, number][]): Shot[] => list.map(([kind, atStep]) => ({ kind, atStep }));
const waits = (run: Run) => run.steps.flatMap((s) => s.events).flatMap((e) => (e.type === 'wait' ? [e.ms] : []));

function checkCaptions(run: Run): void {
  for (const step of run.steps) {
    assert.ok(chars(step.caption) > 0 && chars(step.caption) <= 40, `說明超過 40 字：${step.caption}`);
    if (step.rule !== undefined) assert.ok(chars(step.rule) <= 24);
    assert.equal(step.line, null);
  }
}

test('SHOTS：5 到 6 種，文字長度在限制內，kind 不重複', () => {
  assert.ok(SHOTS.length >= 5 && SHOTS.length <= 6);
  assert.equal(new Set(SHOTS.map((s) => s.kind)).size, SHOTS.length);
  for (const s of SHOTS) {
    assert.ok(chars(s.label) > 0 && chars(s.label) <= 12, `label 超過 12 字：${s.label}`);
    assert.ok(chars(s.hint) > 0 && chars(s.hint) <= 30, `hint 超過 30 字：${s.hint}`);
    assert.deepEqual(Object.keys(s).sort(), ['ballKind', 'hint', 'kind', 'label']);
  }
});

test('沒有任何發射：只有一個空狀態', () => {
  const run = runFreePlay([]);
  assert.deepEqual(run.steps, []);
  assert.deepEqual(run.balls, {});
  assert.deepEqual(run.output, []);
  assert.equal(run.states.length, 1);
  const s = run.states[0]!;
  for (const lane of LANES) assert.equal((lane === 'timers' ? s.timers : s[lane]).length, 0);
  assert.deepEqual(s.output, []);
  assert.deepEqual(s.done, []);
});

test('每一種單發都跑得完，第一步就是把彈珠打進它該去的管線', () => {
  const lanes: Record<string, Lane[]> = { macro: ['macro', 'timers'], micro: ['micro'] };
  for (const def of SHOTS) {
    const run = runFreePlay([{ kind: def.kind, atStep: 0 }]);
    assert.equal(run.states.length, run.steps.length + 1);
    const first = run.steps[0]!.events[0]!;
    assert.equal(first.type, 'spawn');
    if (first.type === 'spawn') {
      assert.equal(run.balls[first.ball]!.kind, def.ballKind);
      assert.ok(lanes[def.ballKind]!.includes(first.to));
    }
    assert.ok(run.output.length >= 1);
    assert.ok(run.output.every((line) => line.includes('#1')));
    const last = run.states[run.states.length - 1]!;
    for (const l of LANES) assert.equal((l === 'timers' ? last.timers : last[l]).length, 0);
    checkCaptions(run);
  }
});

test('單發的輸出', () => {
  assert.deepEqual(runFreePlay(shots(['click', 0])).output, ['click #1']);
  assert.deepEqual(runFreePlay(shots(['timeout0', 0])).output, ['timeout #1']);
  assert.deepEqual(runFreePlay(shots(['then', 0])).output, ['then #1']);
  assert.deepEqual(runFreePlay(shots(['microChain', 0])).output, ['micro #1', 'micro #1-2']);
  assert.deepEqual(runFreePlay(shots(['timeoutThen', 0])).output, ['timeout #1', 'then #1']);
  const slow = runFreePlay(shots(['timeout1s', 0]));
  assert.deepEqual(slow.output, ['timeout #1']);
  assert.deepEqual(waits(slow), [1000]);
});

test('說明通順：印出的那一步不重複標籤，標籤一律英數結尾', () => {
  const run = runFreePlay(SHOTS.map((s) => ({ kind: s.kind, atStep: 0 })));
  const labels = Object.values(run.balls).map((b) => b.label);
  // 標籤一律英數結尾（接中文時自動空一格），而且每顆都不同
  for (const label of labels) assert.match(label, /^[a-z]+ #\d+(-2)?$/);
  assert.equal(new Set(labels).size, labels.length);
  for (const step of run.steps) {
    assert.doesNotMatch(step.caption, /印出 /, `印出的那一步要用自己寫的說明：${step.caption}`);
    assert.doesNotMatch(step.caption, /[A-Za-z0-9]的回呼/, `標籤與「的回呼」之間少了空格：${step.caption}`);
    for (const label of labels) {
      const n = step.caption.split(label).length - 1 - (step.caption.split(`${label}-2`).length - 1);
      assert.ok(n <= 1, `同一個標籤講了兩次：${step.caption}`);
    }
  }
  // 每一行輸出就是印它的那顆彈珠的標籤
  run.steps.forEach((step, k) => {
    const ev = step.events.find((e) => e.type === 'log');
    if (!ev || ev.type !== 'log') return;
    const top = run.states[k]!.stack.at(-1)!;
    assert.equal(ev.text, run.balls[top]!.label);
  });
});

test('多發混合：內圈先清空（含途中排進來的），才輪到外圈', () => {
  const run = runFreePlay(shots(['click', 0], ['timeout0', 0], ['then', 0], ['microChain', 0]));
  assert.deepEqual(run.output, ['then #3', 'micro #4', 'micro #4-2', 'click #1', 'timeout #2']);
  checkCaptions(run);
  assert.ok(run.steps.some((s) => s.rule === '內圈清空才輪到外圈'));
  assert.ok(run.steps.some((s) => s.rule === '清的途中排進來的也一併清掉'));
});

test('外圈依排上去的順序；計時器要先從架上掉下來，排在已經在外圈的後面', () => {
  const run = runFreePlay(shots(['click', 0], ['timeout0', 0], ['click', 0], ['timeout0', 0]));
  assert.deepEqual(run.output, ['click #1', 'click #3', 'timeout #2', 'timeout #4']);
});

test('回呼裡排的 microtask 插在下一顆 macrotask 之前', () => {
  const run = runFreePlay(shots(['timeoutThen', 0], ['timeout0', 0]));
  assert.deepEqual(run.output, ['timeout #1', 'then #1', 'timeout #2']);
});

test('1 秒的計時器不擋別人：機器沒事才等它', () => {
  const run = runFreePlay(shots(['timeout1s', 0], ['timeout0', 0], ['click', 0], ['then', 0]));
  assert.deepEqual(run.output, ['then #4', 'click #3', 'timeout #2', 'timeout #1']);
  assert.deepEqual(waits(run), [1000]);
});

test('在執行途中打進去：前面的步完全不變，那一發成為第 atStep 步', () => {
  const base = shots(['timeout0', 0], ['click', 0], ['timeoutThen', 0]);
  const before = runFreePlay(base);
  for (let at = 0; at <= before.steps.length + 3; at++) {
    const after = runFreePlay([...base, { kind: 'then', atStep: at }]);
    const k = Math.min(Math.max(at, 3), before.steps.length);
    assert.deepEqual(after.steps.slice(0, k), before.steps.slice(0, k));
    assert.deepEqual(after.states.slice(0, k + 1), before.states.slice(0, k + 1));
    const fired = after.steps[k]!;
    assert.equal(fired.events[0]!.type, 'spawn');
    assert.match(fired.caption, /^發射 then #4/);
    assert.ok(after.output.includes('then #4'));
    assert.equal(after.output.length, before.output.length + 1);
    checkCaptions(after);
  }
});

test('外圈的回呼跑到一半時打進內圈：回呼跑完、下一顆外圈之前就處理', () => {
  const base = shots(['click', 0], ['click', 0]);
  const before = runFreePlay(base);
  // 第一顆 click 被夾進主管的那一步之後
  const k = before.steps.findIndex((s) => s.events.some((e) => e.type === 'move' && e.to === 'stack')) + 1;
  const run = runFreePlay([...base, { kind: 'then', atStep: k }]);
  assert.deepEqual(run.output, ['click #1', 'then #3', 'click #2']);
});

test('發射點晚於機器跑完的步數：直接接在最後一步之後，不補等待', () => {
  const first = runFreePlay(shots(['click', 0]));
  const n = first.steps.length;
  const run = runFreePlay(shots(['click', 0], ['then', 999]));
  assert.deepEqual(run.steps.slice(0, n), first.steps);
  assert.match(run.steps[n]!.caption, /^發射 then #2/);
  assert.deepEqual(run.output, ['click #1', 'then #2']);
  assert.deepEqual(waits(run), []);
});

test('編號依打進機器的先後，不是陣列位置；負數與 NaN 當成一開始', () => {
  const a = runFreePlay([
    { kind: 'click', atStep: 50 },
    { kind: 'then', atStep: 0 },
  ]);
  assert.deepEqual(a.output, ['then #1', 'click #2']);
  assert.match(a.steps[0]!.caption, /then #1/);
  const b = runFreePlay([
    { kind: 'then', atStep: -3 },
    { kind: 'then', atStep: NaN },
  ]);
  assert.deepEqual(b.output, ['then #1', 'then #2']);
});

test('同樣的輸入得到相同的輸出，而且不會改到輸入', () => {
  const input = shots(['timeoutThen', 0], ['click', 2], ['microChain', 1], ['timeout1s', 4], ['then', 7]);
  const frozen = JSON.stringify(input);
  const a = runFreePlay(input);
  const b = runFreePlay(input);
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
  assert.equal(JSON.stringify(input), frozen);
  assert.equal(JSON.stringify(a), JSON.stringify(runFreePlay(JSON.parse(frozen) as Shot[])));
});

test('不認得的 kind 會丟錯', () => {
  assert.throws(() => runFreePlay([{ kind: 'nope', atStep: 0 }]), /nope/);
});
