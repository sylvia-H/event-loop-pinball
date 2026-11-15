import { async_, await_, log, program, then_, timeout } from '../../core/program.ts';
import type { CartridgeMeta } from '../meta.ts';

export const meta: CartridgeMeta = {
  slug: '12-finale',
  title: '綜合題：全部一起來',
  teaser: '同步、計時器、Promise、await 放在同一題',
  lead: [
    '先別按播放，自己推一次：哪幾行是同步的？哪些回呼進內圈、順序是什麼？哪一顆走外圈？',
    '同步的先跑完，印出 1、5；內圈依排進去的先後，await 後半段的 2 在前、then 的 4 在後；外圈的 3 最後。答案是 1、5、2、4、3。',
  ],
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
};
