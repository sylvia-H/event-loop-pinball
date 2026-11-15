import { async_, await_, log, program } from '../../core/program.ts';
import type { CartridgeMeta } from '../meta.ts';

export const meta: CartridgeMeta = {
  slug: '06-async-await',
  title: 'async／await：函式切成兩半',
  teaser: 'await 後面那幾行，其實是一顆 microtask',
  lead: [
    '呼叫 async 函式不會把整個函式丟去排隊。await 之前的部分照樣同步執行，連 await 右邊的 async2() 也是當場呼叫。',
    '到了 await，async1 讓出主管，剩下的幾行變成一顆 microtask 排進內圈，等主程式跑完才接著跑。輸出是 1、3、4、2。',
  ],
  nodeOnly: false,
};

export default {
  ...program(
    async_(9, 'async1', [
      log(2, 1),
      // await async2()：先呼叫 async2，它回傳的 Promise 叫 r，再 await r
      async_(3, 'async2', [log(7, 3)], { as: 'r', say: 'await 右邊的 async2() 先當場呼叫，還沒讓出主管' }),
      await_(3, { on: 'r' }),
      log(4, 2),
    ]),
    log(10, 4, 'async1 已經讓出主管，主程式接著跑，先印出 4'),
  ),
  captions: {
    9: '主程式跑完，async1 後半才被夾回主管接著跑',
  },
};
