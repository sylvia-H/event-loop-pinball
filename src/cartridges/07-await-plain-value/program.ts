import { async_, await_, log, program, then_ } from '../../core/program.ts';
import type { CartridgeMeta } from '../meta.ts';

export const meta: CartridgeMeta = {
  slug: '07-await-plain-value',
  title: 'await 一個不是 Promise 的值',
  teaser: 'await 42 沒有東西要等，下一行會接著跑嗎？',
  lead: [
    '42 不是 Promise，沒有什麼好等的。但 await 不看右邊是什麼，一律讓出主管，把後面的程式碼變成一顆 microtask。',
    '所以 2 不會緊接著 1 印出來，要等主程式跑完。它比第 7 行的 then 早排進內圈，所以先執行。輸出是 1、4、2、3。',
  ],
  takeaway: 'await 不看右邊是什麼，一律讓出主管',
  nodeOnly: false,
};

export default {
  ...program(
    async_(6, 'f', [
      log(2, 1),
      await_(3, { say: 'await 42：不是 Promise 也讓出主管，後半排進內圈' }),
      log(4, 2),
    ]),
    then_(7, [log(7, 3)], { say: 'then 的回呼也排進內圈，排在 f 後半的後面' }),
    log(8, 4),
  ),
  captions: {
    7: 'f 後半比 then 早排進內圈，機械臂先夾它',
    10: '內圈照排進去的先後處理，接著才輪到 then',
  },
  rules: {
    7: '內圈先排的先走',
    10: '內圈先排的先走',
  },
};
