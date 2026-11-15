import { log, program, timeout } from '../../core/program.ts';
import type { CartridgeMeta } from '../meta.ts';

export const meta: CartridgeMeta = {
  slug: '02-timeout-zero',
  title: 'setTimeout 0 毫秒',
  teaser: '延遲寫 0 毫秒，回呼會當場執行嗎？',
  lead: [
    'setTimeout 不會當場執行回呼，而是把它掛上計時器架。就算寫 0 毫秒，也要等到期掉上外圈，再等機械臂來夾。',
    '機械臂只在主管空了才動，所以主程式剩下的每一行都會先跑完。輸出是 1、3、2，不是 1、2、3。',
  ],
  takeaway: '0 毫秒不是馬上：回呼排外圈，主程式跑完才輪到',
  nodeOnly: false,
};

export default program(
  log(1, 1),
  timeout(2, 0, [log(2, 2)]),
  log(3, 3),
);
