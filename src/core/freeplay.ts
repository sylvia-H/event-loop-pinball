// 自己發球：從空機器開始，把不同種類的彈珠在指定的時間點打進去，看機械臂照什麼順序處理。
//
// atStep 的意思是「做完第 atStep 步之後打進去」：
//   · 那一發本身會成為第 atStep 步（0 起算），所以在目前的時間點加一發，前面的步完全不變。
//   · 同一個 atStep 有好幾發時，依陣列順序一發接一發。
//   · atStep 比機器跑完時的步數還大：機器在那之前是閒著的，這一發直接接在最後一步之後，不補「等待」的步。
// 編號（#1、#2…）依打進機器的先後（atStep，相同時依陣列順序），不是依陣列位置。

import { event, log, microtask, then_, timeout, type Op } from './program.ts';
import { Machine } from './sim.ts';
import type { BallKind, Run } from './types.ts';

export interface ShotDef {
  kind: string;
  /** 按鈕文字，12 字以內 */
  label: string;
  /** 一句說明，30 字以內 */
  hint: string;
  ballKind: BallKind;
}

export interface Shot {
  kind: string;
  /** 在做完第 atStep 步之後打進去 */
  atStep: number;
}

interface ShotImpl extends ShotDef {
  /** n 是這一發的編號（1 起算） */
  op: (n: number) => Op;
}

const IMPL: readonly ShotImpl[] = [
  {
    kind: 'click',
    label: '點擊事件',
    hint: 'macrotask：回呼直接排上外圈',
    ballKind: 'macro',
    op: (n) => event(null, `click #${n}`, [log(null, `click #${n}`)], `發射 click #${n}：事件的回呼直接排上外圈`),
  },
  {
    kind: 'timeout0',
    label: 'timeout 0',
    hint: '0 毫秒也要先掛上計時器架，再掉上外圈',
    ballKind: 'macro',
    op: (n) =>
      timeout(null, 0, [log(null, `timeout #${n}`)], {
        label: `timeout #${n}`,
        say: `發射 timeout #${n}：0 毫秒也先掛上計時器架`,
      }),
  },
  {
    kind: 'timeout1s',
    label: 'timeout 1 秒',
    hint: '在架上倒數 1 秒，到期才掉上外圈',
    ballKind: 'macro',
    op: (n) =>
      timeout(null, 1000, [log(null, `timeout #${n}`)], {
        label: `timeout #${n}`,
        say: `發射 timeout #${n}：掛上計時器架，倒數 1 秒`,
      }),
  },
  {
    kind: 'then',
    label: 'Promise.then',
    hint: 'microtask：進內圈，比外圈先處理',
    ballKind: 'micro',
    op: (n) =>
      then_(null, [log(null, `then #${n}`)], { label: `then #${n}`, say: `發射 then #${n}：microtask 排進內圈` }),
  },
  {
    kind: 'microChain',
    label: '連環 microtask',
    hint: '執行時再排一顆，同一輪一起清掉',
    ballKind: 'micro',
    op: (n) =>
      microtask(
        null,
        [
          log(null, `micro #${n}`),
          microtask(null, [log(null, `micro #${n} 續`)], {
            label: `micro #${n} 續`,
            say: `micro #${n} 又排了一顆 microtask 進內圈`,
          }),
        ],
        { label: `micro #${n}`, say: `發射 micro #${n}：它執行時會再排一顆` },
      ),
  },
  {
    kind: 'timeoutThen',
    label: '帶 then 的計時器',
    hint: '回呼裡排的 microtask 會插在下一顆外圈前',
    ballKind: 'macro',
    op: (n) =>
      timeout(
        null,
        0,
        [
          log(null, `timeout #${n}`),
          then_(null, [log(null, `then #${n}`)], {
            label: `then #${n}`,
            say: `timeout #${n} 的回呼排了 then #${n} 進內圈`,
          }),
        ],
        { label: `timeout #${n}`, say: `發射 timeout #${n}：回呼裡藏了一顆 then` },
      ),
  },
];

/** 發射鈕的清單，UI 照這個畫按鈕 */
export const SHOTS: readonly ShotDef[] = IMPL.map(({ kind, label, hint, ballKind }) => ({ kind, label, hint, ballKind }));

/** 純函式：同樣的 shots 永遠得到同樣的 Run。沒有任何發射時只有一個空狀態（steps 為空） */
export function runFreePlay(shots: readonly Shot[]): Run {
  const order = shots
    .map((shot, i) => {
      const impl = IMPL.find((s) => s.kind === shot.kind);
      if (!impl) throw new Error(`沒有 ${shot.kind} 這種發射鈕`);
      return { impl, i, at: Number.isFinite(shot.atStep) ? shot.atStep : 0 };
    })
    .sort((a, b) => a.at - b.at || a.i - b.i);

  const machine = new Machine();
  const loop = machine.loop();
  let next = 0;
  const fire = () => {
    const n = next++;
    for (const _ of machine.inject(order[n]!.impl.op(n + 1)));
  };
  for (;;) {
    while (next < order.length && order[next]!.at <= machine.stepCount) fire();
    if (loop.next().value !== 'idle') continue;
    // 機器閒下來了：還有沒打的就直接接著打，沒有就結束
    if (next >= order.length) break;
    fire();
  }
  return machine.finish();
}
