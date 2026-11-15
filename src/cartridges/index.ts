// 卡匣清單。清單只需要標題這類文字（來自各卡匣的 program.ts），整個卡匣（程式碼、Run）點開才載入。
// 新增卡匣：照 README「新增一個卡匣」做完之後，在這裡加一組 import 與一行 entry。

import type { Cartridge, CartridgeEntry } from '../core/types.ts';
import type { CartridgeMeta } from './meta.ts';
import { meta as sync } from './01-sync/program.ts';
import { meta as timeoutZero } from './02-timeout-zero/program.ts';
import { meta as promiseThen } from './03-promise-then/program.ts';
import { meta as classicMix } from './04-classic-mix/program.ts';

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
];
