// 所有顯示給讀者的字串集中在這裡；之後加英文版時換掉這個物件就好。
// 管線的名稱與說明在 core/geometry.ts 的 LANE_INFO（場景的標籤也用同一份）。

import type { BallKind } from '../core/types.ts';

const ballKinds: Record<BallKind, string> = {
  sync: '同步',
  micro: 'microtask',
  macro: 'macrotask',
  tick: 'nextTick',
  immediate: 'setImmediate',
};

export const S = {
  brand: 'Event Loop 彈珠台',

  guide: {
    button: '這台機器怎麼讀',
    title: '這台機器怎麼讀',
    close: '關閉說明',
    intro: [
      '每顆彈珠是一次函式呼叫或一個回呼。機器平常是暗的，彈珠經過哪條管線，那條才亮。',
      '左邊的主管空了，中央的機械臂才會動；它每次先把內圈清光，才去外圈夾一顆。',
    ],
    lanes: '管線',
    balls: '彈珠的顏色',
    ballKinds,
  },

  mode: {
    label: '玩法',
    cart: '卡匣',
    free: '自己發球',
  },

  list: {
    label: '卡匣清單',
    node: 'Node',
    nodeTitle: '只在 Node 成立的行為',
    loading: '載入卡匣中…',
    failed: '這個卡匣載入失敗。',
    retry: '再試一次',
  },

  code: {
    title: 'JavaScript',
    label: '程式碼',
    verified: (node: string) => `Node ${node} 實跑驗證`,
  },

  output: {
    title: '輸出',
    empty: '還沒有印出任何東西',
    right: '猜對',
    wrong: '猜錯',
    youSaid: (text: string) => `你猜 ${text}`,
    allRight: '全對',
    diffFrom: (line: number) => `第 ${line} 行開始不同`,
    jump: '跳到印出那一行的那一步',
    again: '再猜一次',
    checking: (done: number, total: number) => `驗證中：已印出 ${done}／${total} 行`,
  },

  guess: {
    title: '先猜輸出順序',
    hint: '照你認為會印出的順序，逐一點下面的籌碼。',
    picked: '你排的順序',
    pool: '還沒排的',
    remove: (text: string) => `拿掉 ${text}`,
    submit: '放球驗證',
    reset: '重設',
    skip: '不想猜也可以直接拖時間軸。',
  },

  free: {
    label: '發射鈕',
    clear: '清空機器',
    count: (n: number, max: number) => `已發 ${n}／${max} 顆`,
    full: (max: number) => `機器最多裝 ${max} 顆，先清空再發。`,
  },

  stage: {
    label: '機器',
    fallback: '這個瀏覽器無法啟用 WebGL，機器無法顯示；程式碼、輸出、字幕與時間軸仍可使用。',
  },

  timeline: {
    label: '時間軸',
    idleCart: '拖動滑桿，或按 → 開始',
    idleFree: '按左邊的按鈕發一顆球',
    prev: '上一步',
    next: '下一步',
    play: '播放',
    pause: '暫停',
    count: (k: number, n: number) => `第 ${k}／${n} 步`,
    valueText: (k: number, n: number) => `第 ${k} 步，共 ${n} 步`,
  },
};
