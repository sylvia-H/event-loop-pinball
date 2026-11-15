import { async_, await_, log, program, then_, timeout } from '../../core/program.ts';
import type { CartridgeMeta } from '../meta.ts';

export const meta: CartridgeMeta = {
  slug: '12-finale',
  title: '綜合題：全部一起來',
  teaser: '計時器、Promise、await 全放一起，你推得出來嗎？',
  lead: [
    '同步的先跑完：run 在 await 之前印出 1 就讓出主管，主程式接著印出 5。計時器的回呼最先寫，卻走外圈，排到最後。',
    '內圈先排的先走：await 後半的 2 先排，then 的 4 後排。內圈清空才輪到外圈的 3，所以答案是 1、5、2、4、3。',
  ],
  takeaway: '先同步，再內圈（先排的先走），最後才是外圈',
  nodeOnly: false,
};

export default {
  ...program(
    timeout(6, 0, [log(6, 3)], { say: 'setTimeout 最先寫，回呼卻要先掛上計時器架' }),
    async_(7, 'run', [
      log(2, 1),
      await_(3),
      log(4, 2),
    ]),
    then_(8, [log(8, 4)]),
    log(9, 5),
  ),
  captions: {
    8: '內圈依排進去的先後：run 後半先排，所以先夾',
    11: 'then 比 run 後半晚排進內圈，現在才輪到',
    15: '內圈清空了，最後才輪到外圈的 timeout 0ms',
  },
  rules: {
    8: '內圈先排的先走',
    11: '內圈先排的先走',
    15: '內圈清空才輪到外圈',
  },
};
