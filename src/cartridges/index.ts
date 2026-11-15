// 卡匣清單。清單只需要標題這類文字（來自各卡匣的 program.ts），整個卡匣（程式碼、Run）點開才載入。
// 新增卡匣：照 README「新增一個卡匣」做完之後，在這裡加一組 import 與一行 entry。

import type { Cartridge, CartridgeEntry } from '../core/types.ts';
import type { CartridgeMeta } from './meta.ts';
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

const entry = (meta: CartridgeMeta, load: () => Promise<{ default: Cartridge }>): CartridgeEntry => ({
  slug: meta.slug,
  title: meta.title,
  teaser: meta.teaser,
  nodeOnly: meta.nodeOnly,
  load: () => load().then((m) => m.default),
});

export const cartridges: CartridgeEntry[] = [
  entry(sync, () => import('./01-sync/index.ts')),
  entry(timeoutZero, () => import('./02-timeout-zero/index.ts')),
  entry(promiseThen, () => import('./03-promise-then/index.ts')),
  entry(classicMix, () => import('./04-classic-mix/index.ts')),
  entry(microtaskChain, () => import('./05-microtask-chain/index.ts')),
  entry(asyncAwait, () => import('./06-async-await/index.ts')),
  entry(awaitPlainValue, () => import('./07-await-plain-value/index.ts')),
  entry(blockedTimer, () => import('./08-blocked-timer/index.ts')),
  entry(promiseExecutor, () => import('./09-promise-executor/index.ts')),
  entry(nextTick, () => import('./10-next-tick/index.ts')),
  entry(setImmediateVsTimeout, () => import('./11-set-immediate/index.ts')),
  entry(finale, () => import('./12-finale/index.ts')),
];
