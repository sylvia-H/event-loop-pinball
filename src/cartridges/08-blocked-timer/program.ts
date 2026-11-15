import { block, log, program, timeout } from '../../core/program.ts';
import type { CartridgeMeta } from '../meta.ts';

export const meta: CartridgeMeta = {
  slug: '08-blocked-timer',
  title: 'setTimeout 與很久的同步迴圈',
  teaser: '計時器設 10 毫秒，後面的迴圈卻要跑 30 毫秒？',
  lead: [
    'setTimeout(fn, 10) 的意思是最快 10 毫秒後執行。計時器到期只是讓回呼有資格排隊，要等主管空了才輪得到。',
    '這裡主程式接著跑了一段 30 毫秒的同步迴圈。計時器在第 10 毫秒就到期，卻等到迴圈結束、3 印完才執行。輸出是 1、3、2。',
  ],
  takeaway: '設定的毫秒數是最快，不是準時；主管空了才輪到',
  nodeOnly: false,
};

export default {
  ...program(
    log(1, 1),
    timeout(2, 10, [log(2, 2)]),
    block(3, 30),
    log(4, 3, '迴圈結束，但主程式還沒跑完，先印出 3'),
  ),
  captions: {
    4: '迴圈跑了 30 毫秒：計時器第 10 毫秒就到期，卻輪不到',
  },
};
