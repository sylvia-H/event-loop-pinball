import { log, program, then_, timeout } from '../../core/program.ts';
import type { CartridgeMeta } from '../meta.ts';

export const meta: CartridgeMeta = {
  slug: '04-classic-mix',
  title: '經典題：1 4 3 2',
  teaser: 'setTimeout 先寫，卻輸給後寫的 Promise',
  lead: [
    '面試最常見的一題。setTimeout 寫在前面，它的回呼走外圈；Promise.then 寫在後面，它的回呼走內圈。',
    '主管空了以後，機械臂一定先把內圈清空，才去外圈拿一顆。所以 3 比 2 早印出來，跟誰先寫無關。',
  ],
  nodeOnly: false,
};

export default program(
  log(1, 1),
  timeout(2, 0, [log(2, 2)]),
  then_(3, [log(3, 3)]),
  log(4, 4),
);
