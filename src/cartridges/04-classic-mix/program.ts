import { log, program, then_, timeout } from '../../core/program.ts';
import type { CartridgeMeta } from '../meta.ts';

export const meta: CartridgeMeta = {
  slug: '04-classic-mix',
  title: 'setTimeout 0 與 Promise.then',
  teaser: '兩個都是「等一下再做」，誰先？',
  lead: [
    '面試最常見的一題。setTimeout 先寫，回呼走外圈；Promise.then 後寫，回呼走內圈。先寫的卻輸給後寫的。',
    '主管空了以後，機械臂一定先把內圈清空，才去外圈夾一顆。所以 3 比 2 早印，輸出是 1、4、3、2，跟誰先寫無關。',
  ],
  takeaway: '主管空了，機械臂先把內圈清光，才去外圈夾一顆',
  nodeOnly: false,
};

export default program(
  log(1, 1),
  timeout(2, 0, [log(2, 2)]),
  then_(3, [log(3, 3)]),
  log(4, 4),
);
