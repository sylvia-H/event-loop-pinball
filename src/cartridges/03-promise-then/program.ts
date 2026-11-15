import { log, program, then_ } from '../../core/program.ts';
import type { CartridgeMeta } from '../meta.ts';

export const meta: CartridgeMeta = {
  slug: '03-promise-then',
  title: 'Promise.then',
  teaser: 'Promise 早就完成了，then 的回呼還要等嗎？',
  lead: [
    'Promise.resolve() 當下就完成了，但 then 的回呼不會馬上執行，而是變成一顆 microtask，排進內圈。',
    '主程式跑完、主管一空，機械臂第一件事就是把內圈清空。所以輸出是 1、3、2，回呼排在主程式後面。',
  ],
  takeaway: 'then 的回呼一律排進內圈，主管空了才執行',
  nodeOnly: false,
};

export default program(
  log(1, 1),
  then_(2, [log(2, 2)]),
  log(3, 3),
);
