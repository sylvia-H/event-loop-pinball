import { log, program, promise, resolve, then_ } from '../../core/program.ts';
import type { CartridgeMeta } from '../meta.ts';

export const meta: CartridgeMeta = {
  slug: '09-promise-executor',
  title: 'new Promise：executor 不排隊',
  teaser: 'new Promise 裡面那幾行，是同步執行的',
  lead: [
    '傳給 new Promise 的函式叫 executor，建立 Promise 的當下就在主管裡執行，不排隊。resolve() 也不會中斷它，後面那行照跑。',
    '會排進內圈的只有 then 的回呼。所以 2、3 跟著主程式印出來，4 要等主程式跑完，輸出是 1、2、3、5、4。',
  ],
  nodeOnly: false,
};

export default program(
  log(1, 1),
  promise(2, 'p', [
    log(3, 2, 'executor 還在主管裡，直接印出 2，沒有排隊'),
    resolve(4, 'p', 'resolve() 只是把 Promise 標成完成，函式不會停'),
    log(5, 3, 'resolve() 後面那行照樣同步執行，印出 3'),
  ]),
  then_(7, [log(7, 4)], { on: 'p', say: 'Promise 早已完成，then 的回呼仍要排進內圈' }),
  log(8, 5),
);
