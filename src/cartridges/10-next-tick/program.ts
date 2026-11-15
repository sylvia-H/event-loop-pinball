import { log, nextTick, program, then_ } from '../../core/program.ts';
import type { CartridgeMeta } from '../meta.ts';

export const meta: CartridgeMeta = {
  slug: '10-next-tick',
  title: 'process.nextTick：超車道',
  teaser: '後寫的 nextTick，搶在先寫的 Promise 前面',
  lead: [
    'process.nextTick 是 Node 才有的 API，瀏覽器沒有。它的回呼不進內圈，而是排進更裡面的超車道。',
    '主管一空，Node 先清空超車道，才清內圈。所以 then 雖然先寫，還是 nextTick 先印，輸出是 1、4、3、2。',
  ],
  nodeOnly: true,
};

export default program(
  log(1, 1),
  then_(2, [log(2, 2)]),
  nextTick(3, [log(3, 3)], { say: 'nextTick 的回呼不進內圈，排進更裡面的超車道' }),
  log(4, 4),
);
