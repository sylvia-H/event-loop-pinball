// event loop 模擬器：照規則跑一段用資料描述的程式（program.ts），產生一連串「步」。
//
// 規則（與 Node 一致，測試會拿每個卡匣的 code.js 實際輸出來對）：
//   1. 主管（call stack）空了，event loop 才動。
//   2. 每執行完一個 macrotask（最開始的主程式也算），先清空 nextTick 隊伍，再清空 microtask 隊伍；
//      清的途中新排進來的也一併清掉。microtask 清完會再檢查 nextTick，兩邊都空了才往下。
//   3. 一輪（iteration）的順序：計時器 → 外圈上其他的 macrotask → setImmediate。
//      計時器階段開始時已經到期的才掉上外圈（同時到期依登記順序），階段中才登記的等下一輪；
//      setImmediate 階段開始時已經在支線上的才處理，途中新排的等下一輪。
//   4. 佔住主管的同步工作會讓時鐘往前走，計時器照樣倒數，但要等主管空了才輪得到。
//   5. `setTimeout(fn, 0)` 在 Node 等於 1 毫秒：排序時 0 與 1 視為相同（依登記順序），
//      但畫面上不為了這 1 毫秒多演一步「等待」。
//
// 模擬器寫成 generator：每產生一步就讓出一次，「自己發球」才能在任兩步之間把新的彈珠打進去。

import type { Op, Program } from './program.ts';
import type { Ball, BallKind, MachineEvent, MachineState, Run, Step } from './types.ts';

type QueueLane = 'micro' | 'macro' | 'tick' | 'immediate';

/** async 函式的執行脈絡：part 是目前跑到第幾段（每個 await 切一段） */
interface AsyncFrame {
  name: string;
  as?: string;
  part: number;
}

/** 排在隊伍裡、等著被夾進主管的一顆 */
interface Task {
  ball: string;
  body: readonly Op[];
  fn?: AsyncFrame;
  /** 跑完之後要完成的 Promise（`.then()` 回傳的那個） */
  settles?: string;
}

/** 還在等某個 Promise 的回呼：Promise 完成時才變成彈珠 */
interface Waiter {
  label: string;
  line: number | null;
  task: Omit<Task, 'ball'>;
}

interface PromiseRec {
  done: boolean;
  waiting: Waiter[];
}

interface TimerRec {
  task: Task;
  /** 登記時的時鐘 */
  at: number;
  ms: number;
  seq: number;
}

interface Frame {
  ball: string;
  fn?: AsyncFrame;
}

export type Signal = 'step' | 'idle';
type Gen<T = void> = Generator<Signal, T, void>;

/** 防呆：microtask 互相無限排隊時不要把頁面卡死 */
const MAX_STEPS = 5000;

/** 排序用的到期時間：0 毫秒在 Node 等於 1 毫秒 */
const orderDue = (t: TimerRec) => t.at + Math.max(1, t.ms);

const BASE_LABEL: Partial<Record<Op['op'], (op: Op) => string>> = {
  timeout: (op) => `timeout ${(op as { ms: number }).ms}ms`,
  then: () => 'then',
  microtask: () => 'microtask',
  nextTick: () => 'nextTick',
  immediate: () => 'immediate',
  block: (op) => `忙 ${(op as { ms: number }).ms}ms`,
};

/** 沒有指定標籤的回呼自動取名；同名的有好幾顆時依程式碼順序編號（then #1、then #2） */
function autoLabels(body: readonly Op[]): Map<Op, string> {
  const groups = new Map<string, Op[]>();
  const walk = (ops: readonly Op[]) => {
    for (const op of ops) {
      const base = BASE_LABEL[op.op];
      if (base && !('label' in op && op.label)) {
        const key = base(op);
        groups.set(key, [...(groups.get(key) ?? []), op]);
      }
      if ('body' in op) walk(op.body);
    }
  };
  walk(body);
  const out = new Map<Op, string>();
  for (const [key, ops] of groups) {
    ops.forEach((op, i) => out.set(op, ops.length > 1 ? `${key} #${i + 1}` : key));
  }
  return out;
}

export class Machine {
  private balls: Record<string, Ball> = {};
  private steps: Step[] = [];
  private states: MachineState[] = [];
  private stack: string[] = [];
  private queues: Record<QueueLane, Task[]> = { micro: [], macro: [], tick: [], immediate: [] };
  /** 依掛勾順序（登記順序） */
  private timers: TimerRec[] = [];
  private output: string[] = [];
  private done: string[] = [];
  private clock = 0;
  private seq = 0;
  private promises = new Map<string, PromiseRec>();
  /** 彈珠是在第幾步被排進去的 */
  private born = new Map<string, number>();
  private labels = new Map<Op, string>();
  /** 下一步的說明要用這句覆寫 */
  private say: string | undefined;
  /** 下一步的規則要用這個覆寫（null 或空字串是拿掉）；undefined 是照自動產生的 */
  private rule: string | null | undefined;
  /** await 之後的那幾段（不是回呼）：說明裡的稱呼不加「的回呼」 */
  private parts = new Set<string>();
  /** 這一輪清內圈是從第幾步開始的 */
  private drainFrom = 0;

  constructor() {
    this.states.push(this.snapshot());
  }

  get stepCount(): number {
    return this.steps.length;
  }

  finish(): Run {
    return { balls: this.balls, steps: this.steps, states: this.states, output: [...this.output] };
  }

  // ── 對外的三個入口 ────────────────────────────────

  /** 跑一段程式：主程式是第一個 macrotask，跑完接著 event loop，直到機器閒下來 */
  *runProgram(program: Program): Gen {
    this.labels = autoLabels(program.body);
    const main = this.newBall('main', 'sync', '主程式', null);
    this.stack.push(main);
    yield* this.emit([{ type: 'spawn', ball: main, to: 'stack' }], null, '主程式開始：整段程式是第一顆彈珠，進主管');
    yield* this.runBody(program.body, { ball: main });
    this.leave(main);
    const q = this.queues;
    const queued = q.tick.length + q.micro.length + q.macro.length + q.immediate.length + this.timers.length;
    if (queued) {
      yield* this.emit(
        [{ type: 'pop', ball: main }],
        null,
        '主程式跑完，主管空了，輪到機械臂上場',
        '主管空了，event loop 才動',
      );
    } else {
      yield* this.emit([{ type: 'pop', ball: main }], null, '主程式跑完，沒有東西在排隊，機械臂不必出動');
    }
    yield* this.loop();
  }

  /** event loop。沒事可做時讓出 'idle'；之後若有新的彈珠被打進來，再呼叫 next() 會接著跑 */
  *loop(): Gen {
    let phase: 'timers' | 'macro' | 'check' = 'timers';
    let budget = 0;
    for (;;) {
      // 夾任何一顆 macrotask 之前都先確認超車道與內圈是空的
      yield* this.drain();
      if (phase === 'timers') {
        let prev: TimerRec | undefined;
        for (const t of this.expired()) {
          yield* this.dropTimer(t, prev !== undefined && orderDue(prev) === orderDue(t));
          prev = t;
        }
        phase = 'macro';
        budget = this.queues.macro.length;
      } else if (phase === 'macro') {
        if (budget > 0 && this.queues.macro.length) {
          budget--;
          yield* this.runTask('macro');
        } else {
          phase = 'check';
          budget = this.queues.immediate.length;
        }
      } else if (budget > 0 && this.queues.immediate.length) {
        budget--;
        yield* this.runTask('immediate');
      } else {
        phase = 'timers';
        const q = this.queues;
        const busy = q.tick.length || q.micro.length || q.macro.length || q.immediate.length || this.expired().length;
        if (!busy) {
          if (this.timers.length) yield* this.waitForTimer();
          else yield 'idle';
        }
      }
    }
  }

  /** 從機器外面打進一顆（自己發球）：只接受會排進隊伍的操作，產生剛好一步 */
  *inject(op: Op): Gen {
    yield* this.exec(op);
  }

  // ── 內部 ──────────────────────────────────────────

  private snapshot(): MachineState {
    const ids = (lane: QueueLane) => this.queues[lane].map((t) => t.ball);
    return {
      stack: [...this.stack],
      micro: ids('micro'),
      macro: ids('macro'),
      tick: ids('tick'),
      immediate: ids('immediate'),
      timers: this.timers.map((t) => ({ ball: t.task.ball, remaining: Math.max(0, t.at + t.ms - this.clock) })),
      output: [...this.output],
      done: [...this.done],
    };
  }

  private *emit(events: MachineEvent[], line: number | null, caption: string, rule?: string): Gen {
    const step: Step = { events, line, caption: this.say ?? caption };
    const tag = this.rule === undefined ? rule : this.rule;
    this.say = undefined;
    this.rule = undefined;
    if (tag) step.rule = tag;
    this.steps.push(step);
    this.states.push(this.snapshot());
    if (this.steps.length > MAX_STEPS) throw new Error(`超過 ${MAX_STEPS} 步：程式是不是在無限排 microtask？`);
    yield 'step';
  }

  private newBall(id: string | null, kind: BallKind, label: string, line: number | null): string {
    const ballId = id ?? `b${Object.keys(this.balls).length}`;
    this.balls[ballId] = { id: ballId, kind, label, line };
    this.born.set(ballId, this.steps.length);
    return ballId;
  }

  private label(id: string): string {
    return this.balls[id]?.label ?? id;
  }

  /** 標籤後面接中文時要不要空一格：英數結尾才空（then 的、f 後半的） */
  private sp(label: string): string {
    return /[!-~]$/.test(label) ? `${label} ` : label;
  }

  /** 說明裡怎麼稱呼一顆彈珠：回呼是「timeout 0ms 的回呼」，函式與 await 之後的那幾段直接用標籤 */
  private who(id: string): string {
    const ball = this.balls[id];
    if (!ball) return '機器';
    if (id === 'main') return '主程式';
    if (ball.kind === 'sync' || this.parts.has(id)) return this.sp(ball.label);
    return `${this.sp(ball.label)}的回呼`;
  }

  private top(): string {
    return this.who(this.stack[this.stack.length - 1] ?? '');
  }

  /** 彈珠離開主管（一定是最上面那顆） */
  private leave(ball: string): void {
    const top = this.stack.pop();
    if (top !== ball) throw new Error(`模擬器內部錯誤：要離開主管的 ${ball} 不在最上面`);
    this.done.push(ball);
  }

  private promiseOf(name: string, what: string): PromiseRec {
    const p = this.promises.get(name);
    if (!p) throw new Error(`${what}：沒有叫 ${name} 的 Promise（先用 promise()、then_(as) 或 async_(as) 取名）`);
    return p;
  }

  private named(name: string): void {
    if (this.promises.has(name)) throw new Error(`Promise 的名字 ${name} 重複了`);
    this.promises.set(name, { done: false, waiting: [] });
  }

  /** 把一顆新彈珠排進某條隊伍，產生一步 */
  private *enqueue(
    lane: QueueLane,
    kind: BallKind,
    label: string,
    line: number | null,
    task: Omit<Task, 'ball'>,
    caption: string,
    rule?: string,
  ): Gen {
    const ball = this.newBall(null, kind, label, line);
    if (task.fn && task.fn.part > 1) this.parts.add(ball);
    this.queues[lane].push({ ...task, ball });
    yield* this.emit([{ type: 'spawn', ball, to: lane }], line, caption, rule);
  }

  /** Promise 完成：等著它的回呼依登記順序排進內圈，一顆一步 */
  private *settle(name: string, by: string, line: number | null): Gen {
    const p = this.promiseOf(name, 'settle');
    if (p.done) return;
    p.done = true;
    for (const w of p.waiting.splice(0)) {
      const caption = `${by}完成，等著的 ${this.sp(w.label)}排進內圈`;
      yield* this.enqueue('micro', 'micro', w.label, w.line, w.task, caption);
      // 這一步是「現在執行到哪一行」造成的，不是回呼登記的那一行
      this.steps[this.steps.length - 1]!.line = line;
    }
  }

  private *runBody(ops: readonly Op[], frame: Frame): Gen<'done' | 'suspended'> {
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]!;
      if (op.op === 'await') {
        yield* this.suspend(op, frame, ops.slice(i + 1));
        return 'suspended';
      }
      yield* this.exec(op);
    }
    return 'done';
  }

  /** await：函式讓出主管，剩下的部分變成一顆 microtask（Promise 還沒完成就先等著） */
  private *suspend(op: Extract<Op, { op: 'await' }>, frame: Frame, rest: readonly Op[]): Gen {
    const fn = frame.fn;
    if (!fn) throw new Error('await_ 只能直接放在 async_ 的 body 裡');
    const part = fn.part + 1;
    const tail = part === 2 ? '後半' : `第 ${part} 段`;
    const label = `${fn.name} ${tail}`;
    const task: Omit<Task, 'ball'> = { body: rest, fn: { ...fn, part } };
    const target = op.on === undefined ? undefined : this.promiseOf(op.on, 'await_');
    this.say = op.say;
    this.rule = op.rule;
    this.leave(frame.ball);
    const pop: MachineEvent = { type: 'pop', ball: frame.ball };
    if (target && !target.done) {
      target.waiting.push({ label, line: op.line, task });
      yield* this.emit([pop], op.line, `await 的 Promise 還沒完成，${fn.name} 先讓出主管`, 'await 會讓出主管');
      return;
    }
    const ball = this.newBall(null, 'micro', label, op.line);
    this.parts.add(ball);
    this.queues.micro.push({ ...task, ball });
    yield* this.emit(
      [pop, { type: 'spawn', ball, to: 'micro' }],
      op.line,
      `遇到 await：${fn.name} 讓出主管，${tail}排進內圈`,
      'await 之後是一顆 microtask',
    );
  }

  private *exec(op: Op): Gen {
    this.say = op.say;
    this.rule = op.rule;
    const { line } = op;
    const label = ('label' in op && op.label) || this.labels.get(op) || BASE_LABEL[op.op]?.(op) || op.op;
    switch (op.op) {
      case 'log':
        this.output.push(op.text);
        yield* this.emit([{ type: 'log', text: op.text }], line, `${this.top()}印出 ${op.text}`);
        return;

      case 'call': {
        const ball = this.newBall(null, 'sync', op.name, line);
        this.stack.push(ball);
        yield* this.emit(
          [{ type: 'spawn', ball, to: 'stack' }],
          line,
          `呼叫 ${op.name}()：新的一顆疊到主管最上面`,
          '主管一次只跑最上面那一顆',
        );
        yield* this.runBody(op.body, { ball });
        this.leave(ball);
        yield* this.emit([{ type: 'pop', ball }], line, `${op.name} 執行完，從主管頂端離開`);
        return;
      }

      case 'block': {
        const ball = this.newBall(null, 'sync', label, line);
        this.stack.push(ball);
        yield* this.emit([{ type: 'spawn', ball, to: 'stack' }], line, `${label}：一段很久的同步工作進主管`);
        this.clock += op.ms;
        yield* this.emit(
          [{ type: 'wait', ms: op.ms }],
          line,
          `主管被佔住 ${op.ms} 毫秒，計時器照樣倒數`,
          '主管被佔住，計時器只能等',
        );
        this.leave(ball);
        yield* this.emit([{ type: 'pop', ball }], line, `${this.sp(label)}做完了，離開主管`);
        return;
      }

      case 'timeout': {
        const ball = this.newBall(null, 'macro', label, line);
        this.timers.push({ task: { ball, body: op.body }, at: this.clock, ms: Math.max(0, op.ms), seq: this.seq++ });
        const caption =
          op.ms <= 0
            ? 'setTimeout 0 毫秒：回呼還是得先掛上計時器架'
            : `setTimeout：回呼掛上計時器架，倒數 ${op.ms} 毫秒`;
        yield* this.emit([{ type: 'spawn', ball, to: 'timers' }], line, caption);
        return;
      }

      case 'event':
        yield* this.enqueue('macro', 'macro', op.label, line, { body: op.body }, `${op.label}：事件的回呼排上外圈`);
        return;

      case 'immediate':
        yield* this.enqueue(
          'immediate',
          'immediate',
          label,
          line,
          { body: op.body },
          'setImmediate：回呼排進支線，等這一輪的尾巴',
        );
        return;

      case 'nextTick':
        yield* this.enqueue('tick', 'tick', label, line, { body: op.body }, 'process.nextTick：回呼排進超車道');
        return;

      case 'microtask':
        yield* this.enqueue('micro', 'micro', label, line, { body: op.body }, 'queueMicrotask：回呼排進內圈');
        return;

      case 'then': {
        if (op.as !== undefined) this.named(op.as);
        const task: Omit<Task, 'ball'> = { body: op.body, settles: op.as };
        const target = op.on === undefined ? undefined : this.promiseOf(op.on, 'then');
        if (target && !target.done) {
          target.waiting.push({ label, line, task });
          yield* this.emit([], line, `Promise 還沒完成，${this.sp(label)}的回呼先等著`, '完成了才排進內圈');
        } else {
          yield* this.enqueue('micro', 'micro', label, line, task, `Promise 已經完成，${this.sp(label)}的回呼排進內圈`);
        }
        return;
      }

      case 'promise': {
        this.named(op.name);
        const ball = this.newBall(null, 'sync', 'executor', line);
        this.stack.push(ball);
        yield* this.emit(
          [{ type: 'spawn', ball, to: 'stack' }],
          line,
          'new Promise：executor 馬上進主管執行',
          'executor 同步執行',
        );
        yield* this.runBody(op.body, { ball });
        this.leave(ball);
        yield* this.emit([{ type: 'pop', ball }], line, 'executor 執行完，離開主管');
        return;
      }

      case 'resolve': {
        const p = this.promiseOf(op.name, 'resolve');
        if (p.done) {
          yield* this.emit([], line, 'Promise 早就完成了，再 resolve 一次沒有作用');
        } else if (!p.waiting.length) {
          p.done = true;
          yield* this.emit([], line, 'resolve()：Promise 完成了，目前沒有人在等');
        } else {
          yield* this.settle(op.name, 'resolve()：Promise ', line);
        }
        return;
      }

      case 'async': {
        if (op.as !== undefined) this.named(op.as);
        const fn: AsyncFrame = { name: op.name, as: op.as, part: 1 };
        const ball = this.newBall(null, 'sync', op.name, line);
        this.stack.push(ball);
        yield* this.emit(
          [{ type: 'spawn', ball, to: 'stack' }],
          line,
          `呼叫 async 的 ${op.name}()：await 之前照樣同步跑`,
        );
        if ((yield* this.runBody(op.body, { ball, fn })) === 'done') {
          if (fn.as !== undefined) yield* this.settle(fn.as, `${op.name} 回傳的 Promise `, line);
          this.leave(ball);
          yield* this.emit([{ type: 'pop', ball }], line, `${op.name} 執行完，從主管頂端離開`);
        }
        return;
      }

      case 'await':
        throw new Error('await_ 只能直接放在 async_ 的 body 裡');
    }
  }

  /** 清空超車道與內圈，直到兩邊都空 */
  private *drain(): Gen {
    const q = this.queues;
    if (!q.tick.length && !q.micro.length) return;
    this.drainFrom = this.steps.length;
    while (q.tick.length || q.micro.length) {
      while (q.tick.length) yield* this.runTask('tick');
      // microtask 一口氣清到空；途中排的 nextTick 要等內圈清完才輪到
      while (q.micro.length) yield* this.runTask('micro');
    }
  }

  /** 機械臂從隊伍前端夾一顆進主管、執行、離開 */
  private *runTask(lane: QueueLane): Gen {
    const q = this.queues;
    const task = q[lane].shift()!;
    const { ball } = task;
    const label = this.label(ball);
    const line = this.balls[ball]?.line ?? null;
    this.stack.push(ball);

    let caption: string;
    let rule: string | undefined;
    if (lane === 'tick') {
      caption = `機械臂先夾超車道的 ${this.sp(label)}進主管`;
      if (q.micro.length) rule = 'nextTick 排在 Promise 前面';
    } else if (lane === 'micro') {
      if ((this.born.get(ball) ?? 0) >= this.drainFrom) {
        caption = `內圈又多了 ${label}，同一輪就夾進主管`;
        rule = '清的途中排進來的也一併清掉';
      } else {
        caption = `主管空了，機械臂夾內圈的 ${this.sp(label)}進主管`;
        if (q.macro.length || q.immediate.length || this.timers.length) rule = '內圈清空才輪到外圈';
      }
    } else if (lane === 'macro') {
      caption = `內圈是空的，機械臂才夾外圈的 ${label}`;
      if (q.macro.length) rule = '外圈一次只夾一顆';
    } else {
      caption = `計時器這一輪跑完，才夾支線的 ${label}`;
      rule = 'setImmediate 排在計時器之後';
    }
    yield* this.emit([{ type: 'move', ball, from: lane, to: 'stack' }], line, caption, rule);

    if ((yield* this.runBody(task.body, { ball, fn: task.fn })) === 'suspended') return;
    if (task.fn?.as !== undefined) yield* this.settle(task.fn.as, `${task.fn.name} 回傳的 Promise `, line);
    if (task.settles !== undefined) yield* this.settle(task.settles, `${label} 回傳的 Promise `, line);
    this.leave(ball);
    yield* this.emit([{ type: 'pop', ball }], line, `${this.who(ball)}執行完，離開主管`);
  }

  /** 現在已經到期的計時器，依（到期時間、登記順序）；排在前面的還沒到期，後面的也得等 */
  private expired(): TimerRec[] {
    const sorted = [...this.timers].sort((a, b) => orderDue(a) - orderDue(b) || a.seq - b.seq);
    const out: TimerRec[] = [];
    for (const t of sorted) {
      if (t.at + t.ms > this.clock) break;
      out.push(t);
    }
    return out;
  }

  private *dropTimer(t: TimerRec, tie: boolean): Gen {
    const { ball } = t.task;
    const label = this.label(ball);
    this.timers.splice(this.timers.indexOf(t), 1);
    this.queues.macro.push(t.task);
    const late = this.clock > t.at + Math.max(1, t.ms);
    const caption = late
      ? `${this.sp(label)}早就到期，等主管空了才掉上外圈`
      : `${this.sp(label)}時間到，從計時器架掉上外圈排隊`;
    const rule = tie ? '同時到期，依登記順序' : late ? '主管被佔住，計時器只能等' : undefined;
    yield* this.emit([{ type: 'move', ball, from: 'timers', to: 'macro' }], this.balls[ball]?.line ?? null, caption, rule);
  }

  private *waitForTimer(): Gen {
    const next = [...this.timers].sort((a, b) => orderDue(a) - orderDue(b) || a.seq - b.seq)[0]!;
    const ms = next.at + next.ms - this.clock;
    this.clock += ms;
    yield* this.emit([{ type: 'wait', ms }], null, `沒事可做，機械臂等計時器 ${ms} 毫秒`, '到期才掉上外圈');
  }
}

/**
 * 跑一段程式，得到完整的 Run。純函式：同樣的 program 永遠得到同樣的結果。
 * 跑完之後套用卡匣依步驟編號寫的覆寫：captions 換說明，rules 換規則標籤（空字串或 null 是拿掉）。
 */
export function simulate(program: Program): Run {
  const machine = new Machine();
  const gen = machine.runProgram(program);
  while (gen.next().value !== 'idle');
  const run = machine.finish();
  for (const [k, caption] of Object.entries(program.captions ?? {})) {
    const step = run.steps[Number(k)];
    if (!step) throw new Error(`captions 指到不存在的第 ${k} 步（總共 ${run.steps.length} 步）`);
    step.caption = caption;
  }
  for (const [k, rule] of Object.entries(program.rules ?? {})) {
    const step = run.steps[Number(k)];
    if (!step) throw new Error(`rules 指到不存在的第 ${k} 步（總共 ${run.steps.length} 步）`);
    if (rule) step.rule = rule;
    else delete step.rule;
  }
  return run;
}
