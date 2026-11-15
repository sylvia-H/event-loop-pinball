import { immediate, log, program, timeout } from '../../core/program.ts';
import type { CartridgeMeta } from '../meta.ts';

export const meta: CartridgeMeta = {
  slug: '11-set-immediate',
  title: 'setImmediate 與 setTimeout 0',
  teaser: '在計時器的回呼裡同時排這兩個，誰先？',
  lead: [
    'setImmediate 是 Node 才有的 API，瀏覽器沒有。Node 的一輪是先處理到期的計時器，尾巴才處理 setImmediate 的支線。',
    '在計時器回呼裡排的新計時器要等下一輪，支線這一輪就輪到，所以是 3、2、1。頂層的順序不保證，所以面試遇到要先問是在哪裡呼叫的。',
  ],
  takeaway: '計時器回呼裡新掛的計時器等下一輪，支線這一輪就到',
  nodeOnly: true,
};

export default {
  ...program(
    timeout(6, 0, [
      timeout(2, 0, [log(2, 1)], {
        say: '這一輪的計時器已經處理過，新掛的要等下一輪',
        rule: '新掛的計時器要等下一輪',
      }),
      immediate(3, [log(3, 2)]),
      log(4, 3, 'outer 印出 3'),
    ], { label: 'outer' }),
  ),
  captions: {
    8: 'outer 執行完，離開主管',
    9: '這一輪的尾巴輪到支線，immediate 先進主管',
    12: '下一輪的計時器階段，timeout 0ms 才掉上外圈',
  },
  rules: {
    12: '新掛的計時器要等下一輪',
  },
};
