import { call, log, program } from '../../core/program.ts';
import type { CartridgeMeta } from '../meta.ts';

export const meta: CartridgeMeta = {
  slug: '01-sync',
  title: '只有同步的程式',
  teaser: '函式宣告寫在最上面，裡面那一行什麼時候印？',
  lead: [
    '整段程式本身就是第一顆彈珠。宣告函式不會執行它，呼叫時才多一顆疊到主管最上面，跑完才離開，所以輸出是 1、2、3。',
    '主管一次只跑最上面那一顆。這一題沒有東西去排隊，所以內圈、外圈、機械臂從頭到尾都是暗的。',
  ],
  takeaway: '主管一次只跑最上面那一顆，跑完才換下一顆',
  nodeOnly: false,
};

export default program(
  log(4, 1),
  call(5, 'greet', [log(2, 2)]),
  log(6, 3),
);
