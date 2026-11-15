import { call, log, program } from '../../core/program.ts';
import type { CartridgeMeta } from '../meta.ts';

export const meta: CartridgeMeta = {
  slug: '01-sync',
  title: '只有同步：彈珠只進出主管',
  teaser: '沒有任何排隊，一行跑完才換下一行',
  lead: [
    '整段程式本身就是第一顆彈珠，一開始就進主管。每呼叫一個函式，就多一顆疊在最上面，跑完才離開。',
    '主管一次只跑最上面那一顆。這一題沒有東西去排隊，所以內圈、外圈、機械臂從頭到尾都是暗的。',
  ],
  nodeOnly: false,
};

export default program(
  log(4, 1),
  call(5, 'greet', [log(2, 2)]),
  log(6, 3),
);
