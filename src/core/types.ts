// 彈珠台的資料格式。三層：
//   模擬器（sim）照 event loop 的規則跑一段程式，產生一連串「步」；
//   viewAt(run, t) 把時間 t 換成機器當下的畫面（純函式，可倒著拖）；
//   場景只畫 viewAt 的輸出。
// 真相來源是 Node：每個卡匣的 code.js 真的用 Node 跑一次，輸出順序要與模擬器一致。

/** 機器上的管線。tick 與 immediate 只有 Node 有。 */
export type Lane = 'stack' | 'micro' | 'macro' | 'timers' | 'tick' | 'immediate';

export const LANES: readonly Lane[] = ['stack', 'micro', 'macro', 'timers', 'tick', 'immediate'];

/** 彈珠的種類決定顏色，也決定它走哪條管線。 */
export type BallKind =
  /** 同步的函式呼叫：直接進主管 */
  | 'sync'
  /** microtask：Promise.then、await 的後半段、queueMicrotask */
  | 'micro'
  /** macrotask：setTimeout、事件 */
  | 'macro'
  /** process.nextTick（Node） */
  | 'tick'
  /** setImmediate（Node） */
  | 'immediate';

export interface Ball {
  id: string;
  kind: BallKind;
  /** 顯示在彈珠旁的短標籤，例如 `主程式`、`then #1`、`timeout 0ms` */
  label: string;
  /** 這顆彈珠對應的程式碼行（1 起算）：它被排進去的那一行。沒有就是 null */
  line: number | null;
}

/** 機器在某一步結束時的離散狀態。陣列都是「隊伍前端在前」；stack 是底部在前。 */
export interface MachineState {
  stack: string[];
  micro: string[];
  macro: string[];
  tick: string[];
  immediate: string[];
  /** 掛在計時器架上倒數的彈珠 */
  timers: { ball: string; remaining: number }[];
  /** 已經印出來的 console.log */
  output: string[];
  /** 已經執行完、離開機器的彈珠 */
  done: string[];
}

export type MachineEvent =
  /** 一顆新彈珠出現在某條管線上（被排進去） */
  | { type: 'spawn'; ball: string; to: Lane }
  /** 彈珠換管線：計時器到期掉上輸送帶（timers→macro）、被機械臂夾進主管（micro／macro／tick／immediate→stack） */
  | { type: 'move'; ball: string; from: Lane; to: Lane }
  /** 彈珠執行完，從主管頂端離開 */
  | { type: 'pop'; ball: string }
  /** 印出一行 */
  | { type: 'log'; text: string }
  /** 時間流逝（主管空了、在等計時器）：ms 是模擬的毫秒數 */
  | { type: 'wait'; ms: number };

export interface Step {
  events: MachineEvent[];
  /** 這一步正在執行的程式碼行（1 起算），沒有就是 null */
  line: number | null;
  /** 一句白話：這一步發生了什麼。繁體中文、40 字以內 */
  caption: string;
  /** 這一步用到的規則（例如「內圈清空才輪到外圈」），有才寫。24 字以內 */
  rule?: string;
}

/** 模擬器跑完一段程式的結果。 */
export interface Run {
  balls: Record<string, Ball>;
  steps: Step[];
  /** steps.length + 1 個狀態；states[k] 是做完前 k 步之後 */
  states: MachineState[];
  /** 完整的輸出，依印出的順序 */
  output: string[];
}

// ── 畫面 ──────────────────────────────────────────────

export interface BallView {
  id: string;
  kind: BallKind;
  label: string;
  /** 機器座標（見 geometry.ts） */
  x: number;
  y: number;
  alpha: number;
  scale: number;
  /** 0..1：正在移動或剛被處理，要亮一點 */
  glow: number;
  /** 目前在哪條管線上（移動途中算目的地） */
  lane: Lane;
}

export interface MachineView {
  balls: BallView[];
  /** 每條管線的亮度 0..1：有彈珠在上面或剛經過就亮，沒用到的保持 0 */
  lit: Record<Lane, number>;
  /** 機械臂的夾爪位置與開合（1 是夾緊） */
  arm: { x: number; y: number; grip: number; lit: number };
  /** 這個時間點已經印出幾行 */
  outputCount: number;
  /** 掛在計時器架上的彈珠各自剩餘比例 0..1（鍵是彈珠 id），畫倒數用 */
  timerLeft: Record<string, number>;
}

// ── 卡匣 ──────────────────────────────────────────────

/** Node 實際執行 code.js 的結果（scripts/verify-node.mjs 產生的 verified.json）。 */
export interface Verified {
  /** Node 版本，例如 v26.12.1 */
  node: string;
  sha256: string;
  stdout: string;
}

export interface Cartridge {
  slug: string;
  title: string;
  /** 卡匣清單上的一句話，選了之後當成題目顯示；不洩漏答案。30 字以內 */
  teaser: string;
  /** 解說，球跑完（或讀者按「直接看解說」）才顯示：一段一個字串，每段 80 字以內 */
  lead: string[];
  /** 這一題要帶走的規則，一句話，與解說一起顯示。30 字以內 */
  takeaway: string;
  /** 顯示給讀者的 JavaScript（就是 code.js 的內容） */
  code: string;
  /** 只在 Node 成立的行為（nextTick、setImmediate）要標出來 */
  nodeOnly: boolean;
  run: Run;
  verified: Verified;
}

export interface CartridgeEntry {
  slug: string;
  title: string;
  teaser: string;
  nodeOnly: boolean;
  load: () => Promise<Cartridge>;
}
