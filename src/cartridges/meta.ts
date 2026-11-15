// 卡匣的文字資料：放在 program.ts（不是 index.ts），清單不必載入整個卡匣就拿得到，測試也讀得到。

export interface CartridgeMeta {
  /** 與資料夾同名 */
  slug: string;
  title: string;
  /** 卡匣清單上的一句話，30 字以內 */
  teaser: string;
  /** 白話說明：兩段，每段 80 字以內 */
  lead: string[];
  /** 用到 process.nextTick 或 setImmediate（只在 Node 成立）就是 true */
  nodeOnly: boolean;
}
