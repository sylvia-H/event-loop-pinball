// 用真的 Node 執行每個卡匣的 code.js，把實際輸出寫進該卡匣的 verified.json。
// 模擬器的輸出順序要與這裡記下的 stdout 逐行相同（npm test 會對）。
//
//   node scripts/verify-node.mjs                       全部卡匣
//   node scripts/verify-node.mjs 02-timeout-zero 04-classic-mix
//                                                      只跑指定的卡匣（src/cartridges 底下的資料夾名稱）
//
// 執行方式：把 code.js 複製到暫存資料夾、改名 code.cjs，再用 `node code.cjs` 跑。
// 這個專案的 package.json 是 "type": "module"，直接跑 code.js 會被當成 ES module；
// 而 nextTick 與 Promise 誰先，在 ES module 的頂層和一般的 script 不一樣。
// 讀者自己存成檔案用 node 跑的是一般的 script（CommonJS），所以以它為準。

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cartridges');
const TIMEOUT_MS = 10_000;

const args = process.argv.slice(2);
const unknownFlags = args.filter((a) => a.startsWith('--'));
const requested = [...new Set(args.filter((a) => !a.startsWith('--')))];

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
/** 換行一律當成 LF，Windows 上 checkout 成 CRLF 也算同一份內容 */
const readLf = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

function listAll() {
  if (!existsSync(ROOT)) return [];
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(ROOT, d.name, 'code.js')))
    .map((d) => d.name)
    .sort();
}

/** 要處理的卡匣；參數有問題回傳 null */
function select() {
  if (unknownFlags.length) {
    console.error(`不認得的選項：${unknownFlags.join(' ')}`);
    return null;
  }
  if (!requested.length) return listAll();
  let bad = false;
  for (const name of requested) {
    const dir = join(ROOT, name);
    if (name === '.' || name === '..' || /[\/]/.test(name)) {
      console.error(`${name}：要給 src/cartridges 底下的資料夾名稱，不是路徑`);
      bad = true;
    } else if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      console.error(`${name}：src/cartridges 底下沒有這個資料夾`);
      bad = true;
    } else if (!existsSync(join(dir, 'code.js'))) {
      console.error(`${name}：沒有 code.js`);
      bad = true;
    }
  }
  return bad ? null : [...requested].sort();
}

function verify(name, workDir) {
  const dir = join(ROOT, name);
  const code = readLf(join(dir, 'code.js'));
  const file = join(workDir, 'code.cjs');
  writeFileSync(file, code, 'utf8');
  const res = spawnSync(process.execPath, [file], {
    cwd: workDir,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    windowsHide: true,
  });
  if (res.error) {
    const timedOut = res.error.code === 'ETIMEDOUT';
    console.error(`失敗  ${name}：${timedOut ? `超過 ${TIMEOUT_MS / 1000} 秒沒有結束` : res.error.message}`);
    return false;
  }
  if (res.status !== 0) {
    console.error(`失敗  ${name}：node 以代碼 ${res.status} 結束`);
    console.error(String(res.stderr).replace(/^/gm, '    '));
    return false;
  }
  const stdout = String(res.stdout).replace(/\r\n/g, '\n');
  const verified = { node: process.version, sha256: sha256(code), stdout };
  writeFileSync(join(dir, 'verified.json'), JSON.stringify(verified, null, 2) + '\n', 'utf8');
  console.log(`通過  ${name}（Node ${process.version}）：${stdout.trimEnd().split('\n').join(' ')}`);
  return true;
}

const selected = select();
let failed = selected === null;
if (selected?.length) {
  const workDir = mkdtempSync(join(tmpdir(), 'pinball-verify-'));
  try {
    for (const name of selected) {
      try {
        if (!verify(name, workDir)) failed = true;
      } catch (err) {
        failed = true;
        console.error(`失敗  ${name}：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
} else if (selected) {
  console.log('src/cartridges 底下沒有任何 code.js');
}
process.exitCode = failed ? 1 : 0;
