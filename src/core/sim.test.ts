// 模擬器的規則。每一題的期望輸出都是 Node 實際跑對應的 JavaScript 得到的順序。

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  async_,
  await_,
  block,
  call,
  immediate,
  log,
  microtask,
  nextTick,
  program,
  promise,
  resolve,
  then_,
  timeout,
  type Op,
} from './program.ts';
import { simulate } from './sim.ts';
import { LANES, type Lane, type MachineState, type Run } from './types.ts';

const out = (...ops: Op[]) => simulate(program(...ops)).output;
const chars = (s: string) => [...s].length;
const ids = (s: MachineState, lane: Lane) => (lane === 'timers' ? s.timers.map((t) => t.ball) : s[lane]);
const waits = (run: Run) => run.steps.flatMap((s) => s.events).flatMap((e) => (e.type === 'wait' ? [e.ms] : []));

/** 每一步的事件要與前後兩個狀態對得上；彈珠不會憑空出現或同時在兩個地方 */
function checkRun(run: Run): void {
  assert.equal(run.states.length, run.steps.length + 1);
  run.states.forEach((state, k) => {
    const seen = [...LANES.flatMap((l) => ids(state, l)), ...state.done];
    assert.equal(new Set(seen).size, seen.length, `第 ${k} 個狀態有彈珠重複出現`);
    for (const id of seen) assert.ok(run.balls[id], `第 ${k} 個狀態有不認得的彈珠 ${id}`);
  });
  run.steps.forEach((step, k) => {
    const a = run.states[k]!;
    const b = run.states[k + 1]!;
    for (const ev of step.events) {
      if (ev.type === 'spawn') {
        assert.ok(!LANES.some((l) => ids(a, l).includes(ev.ball)), `第 ${k} 步：${ev.ball} 排進去之前就在機器上`);
        assert.ok(ids(b, ev.to).includes(ev.ball), `第 ${k} 步：${ev.ball} 沒有出現在 ${ev.to}`);
      } else if (ev.type === 'move') {
        assert.ok(ids(a, ev.from).includes(ev.ball));
        assert.ok(ids(b, ev.to).includes(ev.ball));
        if (ev.to === 'stack') {
          // 被夾走的一定是隊伍最前面那顆，而且主管是空的
          assert.equal(ids(a, ev.from)[0], ev.ball);
          assert.equal(a.stack.length, 0, `第 ${k} 步：主管還有東西，機械臂就動了`);
        }
        if (ev.from === 'macro' || ev.from === 'immediate') {
          assert.equal(a.micro.length + a.tick.length, 0, `第 ${k} 步：內圈還沒清空就拿 macrotask`);
        }
        if (ev.from === 'timers') {
          assert.equal(a.timers.find((t) => t.ball === ev.ball)!.remaining, 0, `第 ${k} 步：還沒到期就掉下來`);
        }
      } else if (ev.type === 'pop') {
        assert.equal(a.stack[a.stack.length - 1], ev.ball);
        assert.ok(b.done.includes(ev.ball));
      } else if (ev.type === 'log') {
        assert.equal(b.output.length, a.output.length + 1);
        assert.equal(b.output[b.output.length - 1], ev.text);
      }
    }
    assert.ok(chars(step.caption) > 0 && chars(step.caption) <= 40, `第 ${k} 步的說明超過 40 字：${step.caption}`);
    if (step.rule !== undefined) assert.ok(chars(step.rule) <= 24, `第 ${k} 步的規則超過 24 字：${step.rule}`);
  });
  const last = run.states[run.states.length - 1]!;
  assert.deepEqual(last.output, run.output);
  for (const lane of LANES) assert.equal(ids(last, lane).length, 0, `跑完之後 ${lane} 還有彈珠`);
}

test('同步程式碼照順序跑，函式呼叫疊在主管上', () => {
  const run = simulate(program(log(1, 'a'), call(2, 'f', [log(3, 'b'), call(4, 'g', [log(5, 'c')])]), log(6, 'd')));
  assert.deepEqual(run.output, ['a', 'b', 'c', 'd']);
  checkRun(run);
  assert.equal(Math.max(...run.states.map((s) => s.stack.length)), 3);
  // 沒有任何東西去排隊，機械臂沒有動過
  for (const s of run.states) assert.equal(s.micro.length + s.macro.length + s.timers.length, 0);
  assert.ok(!run.steps.some((s) => s.events.some((e) => e.type === 'move')));
});

test('microtask 先於 macrotask', () => {
  const run = simulate(program(log(1, 1), timeout(2, 0, [log(2, 2)]), then_(3, [log(3, 3)]), log(4, 4)));
  assert.deepEqual(run.output, ['1', '4', '3', '2']);
  checkRun(run);
  assert.ok(run.steps.some((s) => s.rule === '內圈清空才輪到外圈'));
  assert.ok(run.steps.some((s) => s.rule === '主管空了，event loop 才動'));
  // setTimeout 0 不會多演一步等待
  assert.deepEqual(waits(run), []);
});

test('microtask 裡排的 microtask 在同一輪清掉，比早就在等的 timeout 還早', () => {
  const run = simulate(
    program(
      timeout(1, 0, [log(1, 'timeout')]),
      then_(2, [log(2, 'a'), microtask(3, [log(3, 'b'), microtask(4, [log(4, 'c')])])]),
      log(5, 'sync'),
    ),
  );
  assert.deepEqual(run.output, ['sync', 'a', 'b', 'c', 'timeout']);
  checkRun(run);
  assert.equal(run.steps.filter((s) => s.rule === '清的途中排進來的也一併清掉').length, 2);
});

test('每個 macrotask 之後都清一次內圈', () => {
  const run = simulate(
    program(timeout(1, 0, [log(1, 't1'), then_(2, [log(2, 'm1')])]), timeout(3, 0, [log(3, 't2')])),
  );
  assert.deepEqual(run.output, ['t1', 'm1', 't2']);
  checkRun(run);
});

test('then 串接：後一個 then 要等前一個跑完才排進內圈', () => {
  // Promise.resolve().then(a1).then(a2); Promise.resolve().then(b1).then(b2);
  const run = simulate(
    program(
      then_(1, [log(1, 'a1')], { as: 'pa' }),
      then_(2, [log(2, 'a2')], { on: 'pa' }),
      then_(3, [log(3, 'b1')], { as: 'pb' }),
      then_(4, [log(4, 'b2')], { on: 'pb' }),
    ),
  );
  assert.deepEqual(run.output, ['a1', 'b1', 'a2', 'b2']);
  checkRun(run);
});

test('nextTick 先於 Promise 的 microtask', () => {
  const run = simulate(program(then_(1, [log(1, 'then')]), nextTick(2, [log(2, 'tick')]), log(3, 'sync')));
  assert.deepEqual(run.output, ['sync', 'tick', 'then']);
  checkRun(run);
  assert.ok(run.steps.some((s) => s.rule === 'nextTick 排在 Promise 前面'));
});

test('microtask 裡排的 nextTick 要等內圈清完；清完會再檢查超車道', () => {
  const run = simulate(
    program(
      then_(1, [log(1, 'p1'), nextTick(2, [log(2, 'tick2')])]),
      then_(3, [log(3, 'p2')]),
      nextTick(4, [log(4, 'tick1'), then_(5, [log(5, 'p3')])]),
      timeout(6, 0, [log(6, 'timeout')]),
    ),
  );
  assert.deepEqual(run.output, ['tick1', 'p1', 'p2', 'p3', 'tick2', 'timeout']);
  checkRun(run);
});

test('計時器依到期時間，同時到期依登記順序', () => {
  const run = simulate(
    program(
      timeout(1, 100, [log(1, 'c')]),
      timeout(2, 10, [log(2, 'a')]),
      timeout(3, 10, [log(3, 'b')]),
      timeout(4, 200, [log(4, 'd')]),
    ),
  );
  assert.deepEqual(run.output, ['a', 'b', 'c', 'd']);
  checkRun(run);
  assert.deepEqual(waits(run), [10, 90, 100]);
  assert.equal(run.steps.filter((s) => s.rule === '同時到期，依登記順序').length, 1);
});

test('setTimeout 0 與 1 在 Node 是同一個到期時間，依登記順序', () => {
  assert.deepEqual(out(timeout(1, 1, [log(1, 'one')]), timeout(2, 0, [log(2, 'zero')])), ['one', 'zero']);
  assert.deepEqual(out(timeout(1, 0, [log(1, 'zero')]), timeout(2, 1, [log(2, 'one')])), ['zero', 'one']);
});

test('等計時器的那一步會讓其他計時器一起倒數', () => {
  const run = simulate(program(timeout(1, 100, [log(1, 'a')]), timeout(2, 250, [log(2, 'b')])));
  checkRun(run);
  assert.deepEqual(waits(run), [100, 150]);
  const k = run.steps.findIndex((s) => s.events[0]?.type === 'wait');
  assert.deepEqual(
    run.states[k]!.timers.map((t) => t.remaining),
    [100, 250],
  );
  assert.deepEqual(
    run.states[k + 1]!.timers.map((t) => t.remaining),
    [0, 150],
  );
});

test('主管被佔住時計時器照樣倒數，但要等主管空了才輪得到', () => {
  const run = simulate(
    program(timeout(1, 50, [log(1, 'late')]), timeout(2, 0, [log(2, 'zero')]), block(3, 200), log(4, 'sync')),
  );
  // 兩個都早就到期了：zero（1 毫秒）在 late（50 毫秒）前面
  assert.deepEqual(run.output, ['sync', 'zero', 'late']);
  checkRun(run);
  // 除了佔住的那一段，不必再等
  assert.deepEqual(waits(run), [200]);
  assert.ok(run.steps.some((s) => s.rule === '主管被佔住，計時器只能等'));
  // 佔住之後，架上的計時器都歸零了，但還掛在架上、主管也還沒空
  const k = run.steps.findIndex((s) => s.events[0]?.type === 'wait');
  const after = run.states[k + 1]!;
  assert.deepEqual(
    after.timers.map((t) => t.remaining),
    [0, 0],
  );
  assert.equal(after.stack.length, 2);
  assert.equal(after.macro.length, 0);
});

test('佔住的時間不夠久，沒到期的計時器還是要等剩下的時間', () => {
  const run = simulate(program(timeout(1, 300, [log(1, 'a')]), block(2, 100)));
  assert.deepEqual(waits(run), [100, 200]);
  checkRun(run);
});

test('計時器的回呼佔住主管：途中才到期的要等下一輪，排在 setImmediate 後面', () => {
  // setTimeout(() => { setImmediate(imm); busy(50); }, 10); setTimeout(t2, 30);
  const run = simulate(
    program(timeout(1, 10, [immediate(2, [log(2, 'imm')]), block(3, 50)]), timeout(4, 30, [log(4, 't2')])),
  );
  assert.deepEqual(run.output, ['imm', 't2']);
  checkRun(run);
});

test('await 把 async 函式切成兩半，後半是一顆 microtask', () => {
  // async function f() { log('f1'); await 0; log('f2'); }  f(); log('sync');
  const run = simulate(program(async_(1, 'f', [log(2, 'f1'), await_(3), log(4, 'f2')]), log(6, 'sync')));
  assert.deepEqual(run.output, ['f1', 'sync', 'f2']);
  checkRun(run);
  const k = run.steps.findIndex((s) => s.rule === 'await 之後是一顆 microtask');
  assert.ok(k >= 0);
  assert.deepEqual(
    run.steps[k]!.events.map((e) => e.type),
    ['pop', 'spawn'],
  );
  // f 讓出主管，main 還在；後半段在內圈等
  assert.deepEqual(run.states[k + 1]!.stack, ['main']);
  assert.equal(run.states[k + 1]!.micro.length, 1);
  assert.equal(run.balls[run.states[k + 1]!.micro[0]!]!.label, 'f 後半');
});

test('兩個 await 切成三段，每一段各讓出一次', () => {
  const run = simulate(
    program(async_(1, 'f', [log(2, 'f1'), await_(3), log(4, 'f2'), await_(5), log(6, 'f3')]), then_(7, [log(7, 'p1'), then_(8, [log(8, 'p2')])])),
  );
  assert.deepEqual(run.output, ['f1', 'f2', 'p1', 'f3', 'p2']);
  checkRun(run);
});

test('經典題：async1／async2／setTimeout／new Promise', () => {
  const run = simulate(
    program(
      log(1, 'script start'),
      timeout(2, 0, [log(2, 'setTimeout')]),
      async_(3, 'async1', [
        log(4, 'async1 start'),
        async_(5, 'async2', [log(6, 'async2')], { as: 'r' }),
        await_(5, { on: 'r' }),
        log(7, 'async1 end'),
      ]),
      promise(8, 'p', [log(9, 'promise1'), resolve(10, 'p')]),
      then_(11, [log(11, 'promise2')], { on: 'p' }),
      log(12, 'script end'),
    ),
  );
  assert.deepEqual(run.output, [
    'script start',
    'async1 start',
    'async2',
    'promise1',
    'script end',
    'async1 end',
    'promise2',
    'setTimeout',
  ]);
  checkRun(run);
});

test('await 還沒完成的 Promise：完成時後半才排進內圈', () => {
  const run = simulate(
    program(
      promise(1, 'p', [timeout(2, 10, [log(2, 'timer'), resolve(3, 'p'), log(4, 'after resolve')])]),
      async_(5, 'f', [log(6, 'f1'), await_(7, { on: 'p' }), log(8, 'f2')]),
      log(9, 'sync'),
    ),
  );
  assert.deepEqual(run.output, ['f1', 'sync', 'timer', 'after resolve', 'f2']);
  checkRun(run);
});

test('new Promise 的 executor 同步執行；resolve 之後的 then 才排隊', () => {
  const run = simulate(
    program(
      log(1, 1),
      promise(2, 'p', [log(3, 2), resolve(4, 'p'), log(5, 3)]),
      then_(6, [log(6, 5)], { on: 'p' }),
      log(7, 4),
    ),
  );
  assert.deepEqual(run.output, ['1', '2', '3', '4', '5']);
  checkRun(run);
  const k = run.steps.findIndex((s) => s.rule === 'executor 同步執行');
  assert.ok(k >= 0);
  // executor 是疊在 main 上面的一顆，不是排隊
  assert.equal(run.states[k + 1]!.stack.length, 2);
});

test('then 掛在還沒完成的 Promise 上：不排隊，resolve 時才依登記順序排進內圈', () => {
  const run = simulate(
    program(
      promise(1, 'p', [timeout(2, 0, [resolve(2, 'p'), log(2, 'resolved')])]),
      then_(3, [log(3, 'a')], { on: 'p' }),
      then_(4, [log(4, 'b')], { on: 'p' }),
      then_(5, [log(5, 'other')]),
    ),
  );
  assert.deepEqual(run.output, ['other', 'resolved', 'a', 'b']);
  checkRun(run);
});

test('setImmediate 排在同一輪的計時器之後、下一輪的計時器之前', () => {
  // setTimeout(() => { setTimeout(t2, 0); setImmediate(imm); }, 0)
  const run = simulate(
    program(timeout(1, 0, [log(1, 't1'), timeout(2, 0, [log(2, 't2')]), immediate(3, [log(3, 'imm')])])),
  );
  assert.deepEqual(run.output, ['t1', 'imm', 't2']);
  checkRun(run);
});

test('setImmediate 的回呼之後，nextTick 與 Promise 也在下一顆之前清掉', () => {
  const run = simulate(
    program(
      timeout(1, 0, [
        immediate(2, [log(2, 'i1'), then_(3, [log(3, 'p')]), nextTick(4, [log(4, 'n')])]),
        immediate(5, [log(5, 'i2')]),
      ]),
    ),
  );
  assert.deepEqual(run.output, ['i1', 'n', 'p', 'i2']);
  checkRun(run);
});

test('彈珠的標籤：同類有好幾顆才編號', () => {
  const one = simulate(program(then_(1, []), timeout(2, 0, [])));
  assert.deepEqual(
    Object.values(one.balls).map((b) => b.label),
    ['main', 'then', 'timeout 0ms'],
  );
  const many = simulate(program(then_(1, [then_(2, [])]), then_(3, [], { label: '自訂' })));
  assert.deepEqual(
    Object.values(many.balls)
      .map((b) => b.label)
      .sort(),
    ['main', 'then #1', 'then #2', '自訂'].sort(),
  );
});

test('彈珠記得自己是在哪一行被排進去的', () => {
  const run = simulate(program(log(1, 1), timeout(2, 0, [log(2, 2)]), then_(3, [log(3, 3)])));
  assert.deepEqual(
    Object.values(run.balls).map((b) => [b.kind, b.line]),
    [
      ['sync', null],
      ['macro', 2],
      ['micro', 3],
    ],
  );
});

test('say 覆寫操作那一步的說明，captions 依步驟編號覆寫', () => {
  const p = program(log(1, 'x', '自己寫的說明'));
  const run = simulate({ ...p, captions: { 0: '開場' } });
  assert.equal(run.steps[0]!.caption, '開場');
  assert.equal(run.steps[1]!.caption, '自己寫的說明');
  assert.notEqual(run.steps[2]!.caption, '自己寫的說明');
  assert.throws(() => simulate({ ...p, captions: { 99: '沒有這一步' } }));
});

test('rules 依步驟編號覆寫規則標籤；空字串或 null 是拿掉自動產生的', () => {
  const p = program(timeout(1, 0, [log(1, 'a')]), then_(2, [log(2, 'b')]));
  const auto = simulate(p);
  const k = auto.steps.findIndex((s) => s.rule === '內圈清空才輪到外圈');
  const idle = auto.steps.findIndex((s) => s.rule === '主管空了，event loop 才動');
  const plain = auto.steps.findIndex((s) => s.rule === undefined);
  assert.ok(k > 0 && idle > 0 && plain >= 0);

  const run = simulate({ ...p, rules: { [k]: '內圈先排的先走', [idle]: '', [plain]: '本來沒有的也可以加' } });
  assert.equal(run.steps[k]!.rule, '內圈先排的先走');
  assert.ok(!('rule' in run.steps[idle]!));
  assert.equal(run.steps[plain]!.rule, '本來沒有的也可以加');
  assert.ok(!('rule' in simulate({ ...p, rules: { [k]: null } }).steps[k]!));
  // 只動規則：說明、事件、狀態、輸出都不變
  assert.deepEqual(run.steps.map((s) => [s.caption, s.events, s.line]), auto.steps.map((s) => [s.caption, s.events, s.line]));
  assert.deepEqual(run.states, auto.states);
  assert.throws(() => simulate({ ...p, rules: { 99: '沒有這一步' } }), /rules/);
  // 覆寫不會改到傳進來的 program，再跑一次仍是自動產生的
  assert.deepEqual(simulate(p), auto);
});

test('操作可以帶 rule：覆寫它產生的那一步的規則，不會漏到下一步', () => {
  const run = simulate(
    program(
      log(1, 'x', { say: '說明與規則一起改', rule: '自己寫的規則' }),
      log(2, 'y'),
      call(3, 'f', [log(4, 'z')], { rule: null }),
      promise(5, 'p', [resolve(5, 'p', { rule: '完成了' })], { rule: '' }),
      then_(6, [], { on: 'p', rule: '照樣排隊' }),
      async_(7, 'g', [await_(8, { rule: '讓出去' })]),
    ),
  );
  const at = (line: number) => run.steps.filter((s) => s.line === line);
  assert.deepEqual([at(1)[0]!.caption, at(1)[0]!.rule], ['說明與規則一起改', '自己寫的規則']);
  assert.equal(at(2)[0]!.rule, undefined);
  // call 自動帶的規則被拿掉；它離開主管的那一步本來就沒有
  assert.deepEqual(at(3).map((s) => s.rule), [undefined, undefined]);
  assert.equal(simulate(program(call(3, 'f', []))).steps[1]!.rule, '主管一次只跑最上面那一顆');
  assert.deepEqual(at(5).map((s) => s.rule), [undefined, '完成了', undefined]);
  assert.equal(at(6)[0]!.rule, '照樣排隊');
  assert.equal(at(8)[0]!.rule, '讓出去');
  checkRun(run);
});

test('說明裡的稱呼：主程式、函式名、「…的回呼」、await 的後半', () => {
  const run = simulate(
    program(
      log(1, 'a'),
      call(2, 'f', [log(2, 'b')]),
      timeout(3, 0, [log(3, 'c')]),
      then_(4, [log(4, 'd')]),
      async_(5, 'g', [await_(5), log(5, 'e'), await_(5), log(5, 'f')]),
      promise(6, 'p', []),
      async_(7, 'h', [await_(7, { on: 'p' }), log(7, 'g')]),
      resolve(8, 'p'),
    ),
  );
  const said = (text: string) => run.steps.find((s) => s.events.some((e) => e.type === 'log' && e.text === text))!.caption;
  assert.equal(said('a'), '主程式印出 a');
  assert.equal(said('b'), 'f 印出 b');
  assert.equal(said('c'), 'timeout 0ms 的回呼印出 c');
  assert.equal(said('d'), 'then 的回呼印出 d');
  assert.equal(said('e'), 'g 後半印出 e');
  assert.equal(said('f'), 'g 第 3 段印出 f');
  // 等 Promise 完成才排進去的後半也一樣，不會被當成回呼
  assert.equal(said('g'), 'h 後半印出 g');
  assert.ok(run.steps.some((s) => s.caption === 'then 的回呼執行完，離開主管'));
  assert.ok(run.steps.some((s) => s.caption === 'h 後半執行完，離開主管'));
});

test('寫錯的程式會丟出說明清楚的錯誤', () => {
  assert.throws(() => simulate(program(await_(1))), /async_/);
  assert.throws(() => simulate(program(call(1, 'f', [await_(2)]))), /async_/);
  assert.throws(() => simulate(program(then_(1, [], { on: 'nope' }))), /nope/);
  assert.throws(() => simulate(program(resolve(1, 'nope'))), /nope/);
});

test('同樣的程式得到同樣的 Run', () => {
  const p = program(log(1, 1), timeout(2, 0, [log(2, 2)]), then_(3, [log(3, 3)]), log(4, 4));
  assert.deepEqual(simulate(p), simulate(p));
});

test('program.ts 沒有匯出叫 then 的東西（不然 await import() 會把模組當成 thenable）', async () => {
  const mod = await import('./program.ts');
  assert.ok(!('then' in mod));
  assert.equal(typeof mod.then_, 'function');
});
