import { log, program, then_, timeout } from '../../core/program.ts';
import type { CartridgeMeta } from '../meta.ts';

export const meta: CartridgeMeta = {
  slug: '05-microtask-chain',
  title: '回呼裡再排 microtask',
  teaser: '回呼跑到一半又排一顆 microtask，算哪一輪？',
  lead: [
    'then 的回呼執行到一半，又排了一顆新的 microtask。新的這顆不必等下一輪：機械臂清內圈時，途中補進來的也一併清掉。',
    '所以外圈那顆 setTimeout 0 只能一直等，等到內圈真的空了才輪到它。輸出是 5、2、3、4、1。',
  ],
  takeaway: '內圈清到空為止，途中補進來的也算這一輪',
  nodeOnly: false,
};

export default program(
  timeout(1, 0, [log(1, 1)]),
  then_(2, [
    log(3, 2),
    then_(
      4,
      [
        log(5, 3),
        then_(6, [log(6, 4)], { say: 'then #2 也再排一顆 then #3，內圈又補上一顆' }),
      ],
      { say: 'then #1 還沒跑完，又排一顆 then #2 進內圈' },
    ),
  ]),
  log(9, 5),
);
