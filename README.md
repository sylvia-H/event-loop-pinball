# Event Loop 彈珠台

一台看得見 JavaScript 執行順序的彈珠台，給準備面試的前端工程師看。每個函式呼叫或回呼是一顆彈珠；機器平常是暗的，彈珠經過哪條管線、那條才亮。

整個網站只有一台機器：直立的主管（call stack）、內圈快軌（microtask）、外圈輸送帶（macrotask）、計時器架、Node 專屬的超車道（`process.nextTick`）與支線（`setImmediate`）、中央的機械臂（event loop）。兩種玩法：

- **卡匣**：一段十行以內的經典題，載入後拖時間軸看彈珠怎麼跑。
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

場景只畫 `viewAt` 的輸出。

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
3. 寫 `program.ts`：每個操作的第一個參數是它在 `code.js` 的行號。`meta` 的 `slug` 與資料夾同名，`teaser` 30 字以內，`lead` 兩段、每段 80 字以內；用到 `nextTick` 或 `immediate` 的卡匣 `nodeOnly` 是 `true`。
4. 從別的卡匣複製 `index.ts`（不用改）。
5. 在 `src/cartridges/index.ts` 加一組 import 與一行 `entry(...)`。
6. `npm test`。模擬器的輸出與 Node 不同、行號超出 `code.js`、文字超過字數、忘了註冊，都會在這裡擋下來。輸出對不上時先懷疑 `program.ts` 寫得不對應 `code.js`；確定對應無誤才是模擬器的規則有漏，那要補規則與測試，不要改 `program.ts` 去湊答案。

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
  title: 'await：函式切成兩半',
  teaser: 'await 後面那幾行，其實是一顆 microtask',
  lead: ['第一段，80 字以內。', '第二段，80 字以內。'],
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
- 印出的編號（`click #1`、`timeout #2`）依打進機器的先後。
