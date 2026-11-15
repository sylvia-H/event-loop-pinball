# Event Loop 彈珠台

一台看得見 JavaScript 執行順序的彈珠台，給準備面試的前端工程師看。每個函式呼叫或回呼是一顆彈珠；機器平常是暗的，彈珠經過哪條管線、那條才亮。

線上版：<https://sylvia-h.github.io/event-loop-pinball/>

推送到 `main` 會由 `.github/workflows/deploy.yml` 自動跑測試、build 並發布到 GitHub Pages；測試或首屏體積檢查不過就不會發布。

整個網站只有一台機器：直立的主管（call stack）、內圈快軌（microtask）、外圈輸送帶（macrotask）、計時器架、Node 專屬的超車道（`process.nextTick`）與支線（`setImmediate`）、中央的機械臂（event loop）。兩種玩法：

- **卡匣**：一段十行以內的經典題。可以先猜輸出順序，再放球看彈珠怎麼跑，跑完才顯示解說（也可以按「直接看解說」提前展開）。
- **自己發球**：按發射鈕把不同種類的彈珠打進機器，看機械臂照什麼順序處理。

## 指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 開發。 |
| `npm run build` | 型別檢查、打包、首屏體積檢查，任一步失敗就中止。 |
| `npm test` | 模擬器的規則、時間→畫面、自己發球，以及每個卡匣「模擬器對 Node」的檢查。 |
| `npm run verify:node` | 用真的 Node 執行每個卡匣的 `code.js`，把輸出寫進該卡匣的 `verified.json`。後面接資料夾名稱（可多個）只跑那幾個，例如 `npm run verify:node -- 02-timeout-zero 04-classic-mix`。 |

## 架構

分三層，分開做、分開驗。

**核心 `src/core/`**

- `types.ts`：資料格式。`Run` 是模擬器跑完的結果：一連串「步」（`steps`），加上每一步前後的機器狀態（`states`）。
- `program.ts`：用資料描述一段程式的寫法（見下方「DSL」）。不解析 JavaScript。
- `sim.ts`：event loop 模擬器。`simulate(program)` 得到 `Run`。
- `view.ts`：`viewAt(run, t)` 把時間 t 換成機器當下的畫面，在相鄰兩個狀態之間內插。純函式，沒有累積狀態，所以時間軸往回拖就是倒著演。
- `geometry.ts`：機器的幾何。場景照它畫機器，`viewAt` 照它算彈珠的位置。
- `freeplay.ts`：自己發球。`runFreePlay(shots)` 從空機器開始，照每一發的時間點打進去。

**畫面 `src/scene/`（three.js）與 `src/ui/`（Preact）**

場景只畫 `viewAt` 的輸出。左欄由上而下：「這台機器怎麼讀」（可收合，第一次造訪自動展開一次；不疊在機器上）、玩法、卡匣清單、題目、程式碼、先猜再看、輸出、解說。

解說會講出答案，所以預設收起：選了卡匣只顯示題目（`teaser`）；時間軸走到最後一步，或讀者按「直接看解說」，才在輸出面板下面展開（先是 `takeaway`，再是 `lead`）。展開過的卡匣在同一次造訪內維持展開，換卡匣時收起，重新整理後全部收起。

**真相來源：Node**

每個卡匣的 `code.js` 真的用 Node 跑過，實際輸出記在 `verified.json`。`npm test` 會確認 `verified.json` 對得上目前的 `code.js`（sha256），而且模擬器跑 `program.ts` 得到的輸出與 Node 逐行相同。

`verify:node` 是把 `code.js` 複製成暫存的 `code.cjs` 再執行：這個專案的 `package.json` 是 `"type": "module"`，直接跑會被當成 ES module，而 `nextTick` 與 Promise 誰先，在 ES module 的頂層和一般的 script 不一樣。讀者自己存檔用 `node` 跑的是一般的 script，所以以它為準。

## event loop 的規則

模擬器實作的就是這幾條：

1. 主管空了，event loop 才動。
2. 每執行完一個 macrotask（最開始的主程式也算），先清空超車道（nextTick），再清空內圈（microtask）；清的途中新排進來的也一併清掉。內圈清完會再檢查超車道，兩邊都空了才去拿下一個 macrotask，而且一次只拿一顆。
3. 內圈裡排的 nextTick 要等內圈這一批清完才輪到；超車道裡排的 microtask 要等超車道清完。
4. 計時器到期才從計時器架掉上外圈，同時到期的依登記順序。`setTimeout(fn, 0)` 在 Node 等於 1 毫秒，所以 0 與 1 是同一個到期時間。
5. 主管被同步工作佔住時，計時器照樣倒數，但要等主管空了才輪得到。
6. 一輪的順序是：計時器 → 外圈上其他的 macrotask → `setImmediate`。這一輪開始時已經到期的計時器才處理，途中才登記或才到期的等下一輪，所以在 macrotask 的回呼裡同時排 `setTimeout(…, 0)` 與 `setImmediate`，一定是 `setImmediate` 先。
7. `await` 把 async 函式切成兩半：`await` 之前同步執行，之後的部分是一顆 microtask。`await` 的不是 Promise 也會讓出一次。
8. `new Promise(executor)` 的 executor 同步執行；`.then` 的回呼要等 Promise 完成才排進內圈，串接的下一個 `.then` 要等前一個回呼跑完。

不保證順序的情境不要做成卡匣：頂層直接比 `setTimeout(…, 0)` 與 `setImmediate`，以及在 `setImmediate` 的回呼裡比這兩者。模擬器會給出一個固定的答案，但 Node 實際上兩種都可能。

## 新增一個卡匣

每個卡匣一個資料夾 `src/cartridges/NN-slug/`：

| 檔案 | 內容 |
| --- | --- |
| `code.js` | 顯示給讀者看的程式碼，真的可以用 Node 執行。十行以內、一行一件事，`console.log` 的內容簡短（數字或單字）。 |
| `program.ts` | 用 DSL 逐行對應 `code.js`（`export default`），以及卡匣的文字（`export const meta`）。 |
| `verified.json` | `npm run verify:node` 產生，不要手改。 |
| `index.ts` | 把以上組成一個 `Cartridge`。每個卡匣都一樣，從別的卡匣複製即可。 |

步驟：

1. 建資料夾，寫 `code.js`。
2. `npm run verify:node -- NN-slug`，確認 Node 的輸出是你要講的那個順序。
3. 寫 `program.ts`：每個操作的第一個參數是它在 `code.js` 的行號。`meta` 照下方「卡匣的文字」寫。
4. 把每一步印出來讀一遍（`simulate(program).steps` 的 `caption` 與 `rule`）。這一題要講的那條規則，至少要有一步帶著它的規則標籤；模擬器沒有自動標的，用 `rules` 補（見「DSL」）。規則的用字照下方「規則標籤」，同一條規則只有一種寫法。
5. 從別的卡匣複製 `index.ts`（不用改）。
6. 在 `src/cartridges/index.ts` 加一組 import 與一行 `entry(...)`。要登記的只有這一個地方。
7. `npm test`。模擬器的輸出與 Node 不同、行號超出 `code.js`、文字超過字數、標題或簡介寫出了輸出順序、沒有任何一步帶規則標籤、忘了註冊，都會在這裡擋下來。輸出對不上時先懷疑 `program.ts` 寫得不對應 `code.js`；確定對應無誤才是模擬器的規則有漏，那要補規則與測試，不要改 `program.ts` 去湊答案。

### 卡匣的文字

讀者選了卡匣之後可以先猜輸出順序，所以 `meta` 的文字分兩組：清單上看得到的不能洩漏答案，球跑完才顯示的要把答案講清楚。

| 欄位 | 什麼時候顯示 | 寫法 |
| --- | --- | --- |
| `slug` | 不顯示 | 與資料夾同名。 |
| `title` | 看球之前（卡匣清單） | 只講主題，不講結論，例如「setTimeout 0 與 Promise.then」。20 字以內，半形的英數算半個字。 |
| `teaser` | 看球之前（卡匣清單；選了之後當成題目） | 一句問句或情境，讓人想猜，例如「兩個都是『等一下再做』，誰先？」。30 字以內。 |
| `takeaway` | 球跑完之後（解說的第一行，最醒目） | 這一題要帶走的規則，一句話，30 字以內。 |
| `lead` | 球跑完之後（解說） | 兩段，每段 80 字以內。結論（輸出順序）與原因都寫在這裡。只在 Node 成立的行為要講明是 Node。 |
| `nodeOnly` | 清單上的標記 | 用到 `nextTick` 或 `immediate` 就是 `true`。 |

- `title` 與 `teaser` 不能出現輸出的數字順序（「1 4 3 2」「1、4、3、2」「1→4→3→2」這幾種寫法測試會擋），也不能講出誰先誰後（「setTimeout 先寫，卻輸給後寫的 Promise」這種句子測試擋不到，要自己把關；好句子搬到 `lead`）。
- `meta` 的欄位由各卡匣的 `index.ts` 整個攤進 `Cartridge`（`src/core/types.ts`，`takeaway` 是它的正式欄位），介面直接讀 `cartridge.takeaway`、`cartridge.lead`。

### 規則標籤

每一步除了說明（`caption`），還可以帶一個規則標籤（`rule`，24 字以內），是讀者要帶走的東西。同一條規則全站只有一種寫法，目前用到的：

| 規則標籤 | 什麼時候標 |
| --- | --- |
| 主管一次只跑最上面那一顆 | 呼叫同步函式（自動） |
| 主管空了，event loop 才動 | 主程式跑完、還有東西在排隊（自動） |
| 內圈清空才輪到外圈 | 夾內圈時外圈或計時器架上還有東西在等（自動）；也可以標在最後輪到外圈的那一步 |
| 清的途中排進來的也一併清掉 | 夾的是這一輪清內圈途中才排進來的（自動） |
| 內圈先排的先走 | 內圈有好幾顆、要強調先後時（卡匣自己標） |
| await 之後是一顆 microtask | `await` 讓出主管、後半排進內圈（自動） |
| await 會讓出主管 | `await` 一個還沒完成的 Promise（自動） |
| 完成了才排進內圈 | `.then` 掛在還沒完成的 Promise 上（自動） |
| executor 同步執行 | `new Promise`（自動） |
| 主管被佔住，計時器只能等 | 同步工作佔住主管、計時器早就到期才掉下來（自動） |
| 到期才掉上外圈 | 機器沒事、等計時器（自動） |
| 同時到期，依登記順序 | 兩個計時器同時到期（自動） |
| 外圈一次只夾一顆 | 夾外圈時後面還有別顆在排（自動） |
| 新掛的計時器要等下一輪 | 在計時器的回呼裡再掛計時器（卡匣自己標） |
| nextTick 排在 Promise 前面 | 夾超車道時內圈也有東西（自動） |
| setImmediate 排在計時器之後 | 夾支線（自動） |

### DSL

`src/core/program.ts` 匯出一組小函式，第一個參數都是行號：

| 寫法 | 對應的 JavaScript |
| --- | --- |
| `log(line, text)` | `console.log(text)` |
| `call(line, 'f', [...])` | 呼叫同步函式 `f()`；陣列是函式的內容 |
| `timeout(line, ms, [...])` | `setTimeout(() => {...}, ms)` |
| `then_(line, [...])` | `Promise.resolve().then(() => {...})` |
| `then_(line, [...], { on: 'p', as: 'q' })` | `const q = p.then(() => {...})`；`on`、`as` 都可以省略 |
| `microtask(line, [...])` | `queueMicrotask(() => {...})` |
| `promise(line, 'p', [...])` | `const p = new Promise((resolve) => {...})`；陣列是 executor |
| `resolve(line, 'p')` | 呼叫 `p` 的 `resolve()` |
| `async_(line, 'f', [...], { as: 'r' })` | 呼叫 async 函式 `f()`；`as` 替它回傳的 Promise 取名，可以省略 |
| `await_(line)`、`await_(line, { on: 'p' })` | `await 0`、`await p`；只能直接放在 `async_` 的陣列裡 |
| `block(line, ms)` | 佔住主執行緒 `ms` 毫秒的同步工作 |
| `nextTick(line, [...])` | `process.nextTick(() => {...})` |
| `immediate(line, [...])` | `setImmediate(() => {...})` |
| `event(line, '標籤', [...])` | 外部事件的回呼直接排上外圈。Node 驗證不了，主要給自己發球用 |

- 會變成彈珠的操作，最後一個參數可以帶 `{ label: '…' }` 指定彈珠的標籤；不寫就自動取（`then`、`timeout 0ms`…），同名的有好幾顆時自動編號。
- 每一步的說明由模擬器自動產生。要改某個操作那一步的說明，帶 `say`：`log(1, 1, '說明')`、`timeout(2, 0, [...], { say: '說明' })`。機械臂夾球這類不是由某個操作直接產生的步驟，用 `{ ...program(...), captions: { 6: '說明' } }` 依步驟編號（0 起算）覆寫。說明 40 字以內。
- 規則標籤也是自動產生的，覆寫的方式與說明相同：操作帶 `rule`（`timeout(2, 0, [...], { say: '說明', rule: '規則' })`；`log`、`call`、`promise`、`resolve`、`event` 這幾個直接寫說明的，改寫成 `log(1, 1, { say: '說明', rule: '規則' })`），或用 `{ ...program(...), rules: { 8: '規則' } }` 依步驟編號覆寫。空字串或 `null` 是把那一步自動產生的規則拿掉。`rules` 與 `captions` 一樣是照步驟編號，前面的步增減之後要重新核對。
- 說明裡對彈珠的稱呼：主程式的彈珠叫「主程式」（彈珠旁的標籤也是），函式直接用名字，回呼是「標籤＋的回呼」（`timeout 0ms 的回呼`），`await` 之後的那一段是「函式名＋後半」。具名函式當回呼傳進去（`setTimeout(outer, 0)`）時，自動的說明會寫成「outer 的回呼」，用 `say`／`captions` 改掉。
- Promise 的名字（`promise` 的第二個參數、`as`）整段程式共用，不能重複。
- 沒有支援的：回呼回傳另一個 Promise（要多等兩輪 microtask）、reject 與 `catch`、`setInterval`、`clearTimeout`。

完整的例子，`await async2()` 那一題：

```js
async function async1() {
  console.log(1);
  await async2();
  console.log(2);
}
async function async2() {
  console.log(3);
}
async1();
new Promise((resolve) => resolve()).then(() => console.log(4));
console.log(5);
```

```ts
import { async_, await_, log, program, promise, resolve, then_ } from '../../core/program.ts';
import type { CartridgeMeta } from '../meta.ts';

export const meta: CartridgeMeta = {
  slug: '07-async-await',
  title: 'async／await 與 new Promise',
  teaser: 'await 後面那一行，和 then 的回呼誰先？',
  lead: ['第一段，80 字以內：結論與原因。', '第二段，80 字以內。'],
  takeaway: '要帶走的那一句，30 字以內。',
  nodeOnly: false,
};

export default program(
  async_(9, 'async1', [
    log(2, 1),
    // await async2()：先呼叫 async2，它回傳的 Promise 叫 r，再 await r
    async_(3, 'async2', [log(7, 3)], { as: 'r' }),
    await_(3, { on: 'r' }),
    log(4, 2),
  ]),
  promise(10, 'p', [resolve(10, 'p')]),
  then_(10, [log(10, 4)], { on: 'p' }),
  log(11, 5),
);
```

Node 的輸出是 1、3、5、2、4。

## 自己發球

`SHOTS` 是發射鈕的清單。`runFreePlay(shots)` 的每一發是 `{ kind, atStep }`，意思是「做完第 `atStep` 步之後打進去」：

- 那一發本身成為第 `atStep` 步，所以在目前的時間點加一發，前面的步完全不變。
- 同一個 `atStep` 有好幾發時依陣列順序。
- `atStep` 比機器跑完時的步數還大時，直接接在最後一步之後，不補「等待」的步。
- 彈珠的標籤是「種類 #編號」（`click #1`、`then #4`），編號依打進機器的先後；回呼印出的就是自己的標籤。連環 microtask 排的第二顆是 `micro #4-2`，帶 then 的計時器排的那顆與它同號（`timeout #6`、`then #6`）。
- 輸出面板每一行行首的色點是印它的那顆彈珠的種類。
