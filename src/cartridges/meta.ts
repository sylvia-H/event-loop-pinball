// 卡匣的文字資料：放在 program.ts（不是 index.ts），清單不必載入整個卡匣就拿得到，測試也讀得到。
//
// 文字分兩組。讀者選了卡匣之後可以先猜輸出順序，所以：
//   看球之前（卡匣清單）：title、teaser。只講主題，不能洩漏答案。
//   看球之後（球跑完才顯示）：lead、takeaway。把結論與原因講清楚。

import { meta as sync } from './01-sync/program.ts';
import { meta as timeoutZero } from './02-timeout-zero/program.ts';
import { meta as promiseThen } from './03-promise-then/program.ts';
import { meta as classicMix } from './04-classic-mix/program.ts';
import { meta as microtaskChain } from './05-microtask-chain/program.ts';
import { meta as asyncAwait } from './06-async-await/program.ts';
import { meta as awaitPlainValue } from './07-await-plain-value/program.ts';
import { meta as blockedTimer } from './08-blocked-timer/program.ts';
import { meta as promiseExecutor } from './09-promise-executor/program.ts';
import { meta as nextTick } from './10-next-tick/program.ts';
import { meta as setImmediateVsTimeout } from './11-set-immediate/program.ts';
import { meta as finale } from './12-finale/program.ts';

export interface CartridgeMeta {
  /** 與資料夾同名 */
  slug: string;
  /** 卡匣清單上的標題：只講主題，不講結論（不寫輸出順序、不寫誰先誰後）。20 字以內，半形的英數算半個字 */
  title: string;
  /** 卡匣清單上的一句話：寫成問句或情境，讓人想猜；同樣不能洩漏答案。30 字以內 */
  teaser: string;
  /** 解說，球跑完才顯示：兩段，每段 80 字以內。結論與原因寫在這裡 */
  lead: string[];
  /** 這一題要帶走的規則，一句話，球跑完才顯示。30 字以內 */
  takeaway: string;
  /** 用到 process.nextTick 或 setImmediate（只在 Node 成立）就是 true */
  nodeOnly: boolean;
}

/**
 * 每個卡匣要帶走的那一句，用 slug 查。
 * `Cartridge` 型別（core/types.ts）還沒有 takeaway 欄位，介面先從這裡拿：`takeaways[cartridge.slug]`。
 * 新增卡匣時這裡也要加（測試會擋）。
 */
export const takeaways: Readonly<Record<string, string>> = Object.fromEntries(
  [
    sync,
    timeoutZero,
    promiseThen,
    classicMix,
    microtaskChain,
    asyncAwait,
    awaitPlainValue,
    blockedTimer,
    promiseExecutor,
    nextTick,
    setImmediateVsTimeout,
    finale,
  ].map((m) => [m.slug, m.takeaway]),
);
