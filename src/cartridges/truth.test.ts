// 真相對照：每個卡匣的 code.js 真的用 Node 跑過（verified.json），模擬器的輸出順序要與它逐行相同。
// code.js 改過卻沒有重跑 npm run verify:node，這裡會擋下來。

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Program } from '../core/program.ts';
import { simulate } from '../core/sim.ts';
import type { Verified } from '../core/types.ts';
import { ballsForLine } from '../core/view.ts';
import type { CartridgeMeta } from './meta.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));
const folders = readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const chars = (s: string) => [...s].length;
/** 標題的長度：全形字算 1，半形的英數、空白與標點算半個（API 名稱很長，照字元數算會塞不下） */
const width = (s: string) => [...s].reduce((n, c) => n + (c.charCodeAt(0) < 0x80 ? 0.5 : 1), 0);
const readLf = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

/**
 * text 有沒有寫出輸出順序：把各行用空白、頓號、逗號、「→」等接起來的寫法都算（空白一律忽略）。
 * 有就回傳那一段，沒有回傳 null。
 */
function spoiler(text: string, output: readonly string[]): string | null {
  if (output.length < 2) return null;
  const squeezed = text.replace(/\s+/g, '');
  for (const sep of ['', '、', ',', '，', '→', '->', '＞', '>', '/', '／']) {
    const joined = output.map((line) => line.replace(/\s+/g, '')).join(sep);
    if (squeezed.includes(joined)) return joined;
  }
  return null;
}

test('至少有前 4 個卡匣，資料夾名稱是 NN-slug', () => {
  assert.ok(folders.length >= 4);
  for (const name of folders) assert.match(name, /^\d\d-[a-z0-9-]+$/);
});

for (const name of folders) {
  const dir = join(ROOT, name);

  test(`${name}：檔案齊全`, () => {
    for (const file of ['code.js', 'program.ts', 'index.ts', 'verified.json']) {
      assert.ok(existsSync(join(dir, file)), `缺 ${file}（verified.json 用 npm run verify:node 產生）`);
    }
  });

  test(`${name}：verified.json 對得上目前的 code.js，模擬器的輸出與 Node 逐行相同`, async () => {
    const code = readLf(join(dir, 'code.js'));
    const verified = JSON.parse(readFileSync(join(dir, 'verified.json'), 'utf8')) as Verified;
    assert.equal(
      verified.sha256,
      createHash('sha256').update(code, 'utf8').digest('hex'),
      'code.js 改過了，重跑 npm run verify:node',
    );
    assert.match(verified.node, /^v\d+\./);

    const mod = (await import(pathToFileURL(join(dir, 'program.ts')).href)) as {
      default: Program;
      meta: CartridgeMeta;
    };
    const run = simulate(mod.default);
    assert.ok(verified.stdout.endsWith('\n'), 'stdout 是空的：code.js 沒有印出任何東西');
    assert.deepEqual(run.output, verified.stdout.replace(/\n$/, '').split('\n'));

    // 程式碼十行以內；每一步的行號都落在 code.js 裡，印出東西的那一行真的有 console.log
    const lines = code.replace(/\n$/, '').split('\n');
    assert.ok(lines.length <= 10, `code.js 有 ${lines.length} 行，超過 10 行`);
    for (const step of run.steps) {
      assert.ok(chars(step.caption) > 0 && chars(step.caption) <= 40, `說明超過 40 字：${step.caption}`);
      if (step.rule !== undefined) assert.ok(chars(step.rule) <= 24, `規則超過 24 字：${step.rule}`);
      if (step.line === null) continue;
      assert.ok(step.line >= 1 && step.line <= lines.length, `行號 ${step.line} 不在 code.js 裡`);
      if (step.events.some((e) => e.type === 'log')) assert.match(lines[step.line - 1]!, /console\.log/);
    }
    // 每一行有內容的程式碼都至少對到一顆彈珠（函式宣告與只有 `}` 的收尾行除外）
    lines.forEach((text, i) => {
      if (/^[\s})\];,]*$/.test(text) || /^\s*(async\s+)?function\b/.test(text)) return;
      assert.ok(ballsForLine(run, i + 1).length > 0, `第 ${i + 1} 行沒有對到任何彈珠：${text}`);
    });

    // 文字資料
    const { meta } = mod;
    assert.equal(meta.slug, name);
    assert.ok(width(meta.title) > 0 && width(meta.title) <= 20, `title 超過 20 字（半形算半個）：${meta.title}`);
    assert.ok(chars(meta.teaser) > 0 && chars(meta.teaser) <= 30, `teaser 超過 30 字：${meta.teaser}`);
    assert.equal(meta.lead.length, 2);
    for (const para of meta.lead) {
      assert.ok(chars(para) > 0 && chars(para) <= 80, `lead 的一段超過 80 字（${chars(para)}）：${para}`);
    }
    assert.ok(
      typeof meta.takeaway === 'string' && chars(meta.takeaway) > 0 && chars(meta.takeaway) <= 30,
      `takeaway 要有，而且 30 字以內：${meta.takeaway}`,
    );
    // 讀者是先猜再看：清單上的 title、teaser 不能寫出輸出順序
    for (const [field, text] of [['title', meta.title], ['teaser', meta.teaser]] as const) {
      const leak = spoiler(text, run.output);
      assert.equal(leak, null, `${field} 洩漏了輸出順序「${leak}」：${text}`);
    }
    // 每個卡匣至少有一步帶規則標籤：那是讀者要帶走的東西
    assert.ok(run.steps.some((s) => s.rule), '沒有任何一步帶規則標籤');
    const usesNode = /"op":"(nextTick|immediate)"/.test(JSON.stringify(mod.default));
    assert.equal(meta.nodeOnly, usesNode, 'nodeOnly 要與程式有沒有用到 nextTick／setImmediate 一致');
  });
}

test('spoiler：輸出順序的幾種寫法都擋得到，只提到其中幾個數字不算', () => {
  const output = ['1', '4', '3', '2'];
  for (const text of ['經典題：1 4 3 2', '答案是 1、4、3、2', '1,4,3,2', '1, 4, 3, 2', '1，4，3，2', '1→4→3→2', '1 → 4 → 3 → 2', '1432', '1 -> 4 -> 3 -> 2']) {
    assert.notEqual(spoiler(text, output), null, text);
  }
  for (const text of ['setTimeout 0 與 Promise.then', '計時器設 10 毫秒，迴圈跑 30 毫秒', '1、2、3、4']) {
    assert.equal(spoiler(text, output), null, text);
  }
  // 只印一行的卡匣沒有「順序」可言
  assert.equal(spoiler('await 42', ['42']), null);
});

test('清單（index.ts）註冊了每一個資料夾，各卡匣的 index.ts 把 meta 整個攤進卡匣', () => {
  const index = readFileSync(join(ROOT, 'index.ts'), 'utf8');
  for (const name of folders) {
    // takeaway 這類文字欄位靠 `...meta` 帶進 Cartridge；少了它 tsc 也會擋
    assert.match(readFileSync(join(ROOT, name, 'index.ts'), 'utf8'), /{ ...meta,/, `${name}/index.ts 沒有攤開 meta`);
    assert.ok(index.includes(`'./${name}/program.ts'`), `index.ts 沒有匯入 ${name} 的 meta`);
    assert.ok(index.includes(`import('./${name}/index.ts')`), `index.ts 沒有註冊 ${name}`);
  }
});
