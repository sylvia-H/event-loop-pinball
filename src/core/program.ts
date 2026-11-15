// 用資料描述一段程式（不解析 JavaScript）。卡匣的 program.ts 用下面的小函式逐行對應 code.js，
// 模擬器（sim.ts）照 event loop 的規則跑它。每個操作的第一個參數都是它在 code.js 的行號（1 起算）。
//
//   program(
//     log(1, '1'),
//     timeout(2, 0, [log(2, '2')]),
//     then_(3, [log(3, '3')]),
//     log(4, '4'),
//   )

interface Base {
  /** 對應 code.js 的哪一行（1 起算）；自己發球的彈珠沒有程式碼，是 null */
  line: number | null;
  /** 覆寫這個操作產生的那一步的說明（40 字以內）；不寫就用模擬器自動產生的 */
  say?: string;
  /** 覆寫這個操作產生的那一步的規則標籤（24 字以內）；空字串或 null 是把自動產生的拿掉 */
  rule?: string | null;
}

/** 會變成一顆彈珠的操作，可以自己指定彈珠的標籤；不寫就自動取（同類有好幾顆時自動編號） */
interface Labeled extends Base {
  label?: string;
}

export type Op =
  /** `console.log(text)` */
  | (Base & { op: 'log'; text: string })
  /** 呼叫同步函式 `name()`：一顆彈珠疊進主管，body 跑完才離開 */
  | (Base & { op: 'call'; name: string; body: readonly Op[] })
  /** 佔住主執行緒 ms 毫秒的同步工作（例如很久的迴圈）。計時器照樣倒數，但輪不到 */
  | (Labeled & { op: 'block'; ms: number })
  /** `setTimeout(fn, ms)` */
  | (Labeled & { op: 'timeout'; ms: number; body: readonly Op[] })
  /** 外部事件（點擊、I/O）的回呼：直接排上外圈。Node 驗證不了，卡匣少用，主要給自己發球 */
  | (Base & { op: 'event'; label: string; body: readonly Op[] })
  /** `setImmediate(fn)`（Node） */
  | (Labeled & { op: 'immediate'; body: readonly Op[] })
  /** `process.nextTick(fn)`（Node） */
  | (Labeled & { op: 'nextTick'; body: readonly Op[] })
  /** `queueMicrotask(fn)` */
  | (Labeled & { op: 'microtask'; body: readonly Op[] })
  /**
   * `.then(fn)`。不寫 on 就是 `Promise.resolve().then(fn)`；on 是要掛上去的 Promise 的名字。
   * as 替 `.then()` 回傳的新 Promise 取名，下一個 `.then` 用 on 接上去（串接）。
   */
  | (Labeled & { op: 'then'; body: readonly Op[]; on?: string; as?: string })
  /** `const name = new Promise(executor)`：body 是 executor，同步執行；裡面用 resolve(line, name) */
  | (Base & { op: 'promise'; name: string; body: readonly Op[] })
  /** 呼叫 name 這個 Promise 的 `resolve()` */
  | (Base & { op: 'resolve'; name: string })
  /** 呼叫 async 函式 `name()`。body 裡可以放 await_()；as 替它回傳的 Promise 取名 */
  | (Base & { op: 'async'; name: string; body: readonly Op[]; as?: string })
  /** `await`。只能直接放在 async 的 body 裡。不寫 on 是 await 一個非 Promise 的值或已完成的 Promise */
  | (Base & { op: 'await'; on?: string });

export interface Program {
  body: readonly Op[];
  /** 依步驟編號（0 起算）覆寫說明，給機械臂夾球這類不是由某個操作直接產生的步驟用 */
  captions?: Readonly<Record<number, string>>;
  /** 依步驟編號（0 起算）覆寫規則標籤；空字串或 null 是把那一步自動產生的規則拿掉 */
  rules?: Readonly<Record<number, string | null>>;
}

type Line = number | null;
/** 說明與規則標籤的覆寫 */
type Note = { say?: string; rule?: string | null };
type Opts = Note & { label?: string };
/** 沒有選項物件的操作：最後一個參數直接寫說明，要連規則一起改就寫 { say, rule } */
type Say = string | Note;

const note = (s: Say | undefined): Note => (typeof s === 'string' ? { say: s } : (s ?? {}));

const clean = <T extends object>(o: T): T => {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
};

export const program = (...body: Op[]): Program => ({ body });

export const log = (line: Line, text: string | number, say?: Say): Op =>
  clean({ op: 'log', line, text: String(text), ...note(say) });

export const call = (line: Line, name: string, body: readonly Op[], say?: Say): Op =>
  clean({ op: 'call', line, name, body, ...note(say) });

export const block = (line: Line, ms: number, o: Opts = {}): Op => clean({ op: 'block', line, ms, ...o });

export const timeout = (line: Line, ms: number, body: readonly Op[], o: Opts = {}): Op =>
  clean({ op: 'timeout', line, ms, body, ...o });

export const event = (line: Line, label: string, body: readonly Op[], say?: Say): Op =>
  clean({ op: 'event', line, label, body, ...note(say) });

export const immediate = (line: Line, body: readonly Op[], o: Opts = {}): Op =>
  clean({ op: 'immediate', line, body, ...o });

export const nextTick = (line: Line, body: readonly Op[], o: Opts = {}): Op =>
  clean({ op: 'nextTick', line, body, ...o });

export const microtask = (line: Line, body: readonly Op[], o: Opts = {}): Op =>
  clean({ op: 'microtask', line, body, ...o });

// 名字帶底線：模組要是匯出叫 then 的函式，整個模組會被 await import() 當成 thenable 呼叫。
export const then_ = (line: Line, body: readonly Op[], o: Opts & { on?: string; as?: string } = {}): Op =>
  clean({ op: 'then', line, body, ...o });

export const promise = (line: Line, name: string, body: readonly Op[], say?: Say): Op =>
  clean({ op: 'promise', line, name, body, ...note(say) });

export const resolve = (line: Line, name: string, say?: Say): Op =>
  clean({ op: 'resolve', line, name, ...note(say) });

export const async_ = (line: Line, name: string, body: readonly Op[], o: Note & { as?: string } = {}): Op =>
  clean({ op: 'async', line, name, body, ...o });

export const await_ = (line: Line, o: Note & { on?: string } = {}): Op => clean({ op: 'await', line, ...o });
