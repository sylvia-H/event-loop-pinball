// 卡匣的文字資料：放在 program.ts（不是 index.ts），清單不必載入整個卡匣就拿得到，測試也讀得到。
//
// 文字分兩組。讀者選了卡匣之後可以先猜輸出順序，所以：
//   看球之前（卡匣清單）：title、teaser。只講主題，不能洩漏答案。
//   看球之後（球跑完才顯示）：lead、takeaway。把結論與原因講清楚。
// 各卡匣的 index.ts 把 meta 整個攤進 Cartridge（core/types.ts），介面直接從卡匣物件讀。

export interface CartridgeMeta {
  /** 與資料夾同名 */
  slug: string;
  /** 卡匣清單上的標題：只講主題，不講結論（不寫輸出順序、不寫誰先誰後）。20 字以內，半形的英數算半個字 */
  title: string;
  /** 卡匣清單上的一句話：寫成問句或情境，讓人想猜；同樣不能洩漏答案。30 字以內 */
  teaser: string;
  /** 解說，球跑完才顯示：兩段，每段 80 字以內。結論與原因寫在這裡 */
  lead: string[];
  /** 這一題要帶走的規則，一句話，球跑完才顯示。30 字以內 */
  takeaway: string;
  /** 用到 process.nextTick 或 setImmediate（只在 Node 成立）就是 true */
  nodeOnly: boolean;
}
