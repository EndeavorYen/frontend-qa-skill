// Standalone audit / critique / advise modes, the anti-pattern list, and design context.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptsDir, '..');
const read = (path) => readFileSync(join(skillDir, path), 'utf8');

const CHECKS = [
  ['multiplePrimaryButtons', 'multiple-primary-buttons'],
  ['placeholderAsLabel', 'placeholder-as-label'],
  ['genericDialogActions', 'generic-dialog-actions'],
  ['colorOnlyStatus', 'color-only-status'],
  ['grayOnColor', 'gray-on-color'],
  ['nestedCards', 'nested-cards'],
  ['centeredLongText', 'centered-long-text'],
  ['emptyStateNoAction', 'empty-state-no-action'],
  ['vagueError', 'vague-error'],
  ['destructiveLooksPrimary', 'destructive-looks-primary'],
];

const NAMES = [
  '同一區塊有多顆一樣重的主要按鈕',
  '對話框問句和按鈕語意不符',
  '用 placeholder 當 label',
  '只用顏色區分狀態',
  '灰字放在彩色背景上',
  '卡片裡又包卡片',
  '長段落置中對齊',
  '空狀態只寫「無資料」，沒有下一步',
  '錯誤訊息只寫「發生錯誤」',
  '錯誤用 toast 顯示，而且很快就消失',
  '破壞性動作和主要動作外觀相同',
  '表單送出後沒有任何狀態變化',
];

const HIT_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body style="background:#fff">
  <div id="primaries">
    <button style="background:#2563eb;color:#fff">新增</button>
    <button style="background:#2563eb;color:#fff">匯出</button>
  </div>
  <input id="ph" placeholder="客戶名稱" style="display:block;width:200px;height:40px">
  <div role="dialog" aria-modal="true" style="display:block;width:320px;padding:12px;background:#fff">
    <p>要放棄變更嗎？</p>
    <button>確定</button><button>取消</button>
  </div>
  <div id="dots">
    <span style="display:inline-block;width:10px;height:10px;background:#16a34a;border-radius:50%"></span>
    <span style="display:inline-block;width:10px;height:10px;background:#dc2626;border-radius:50%"></span>
  </div>
  <div style="background:#7c3aed;padding:8px"><p style="color:#9ca3af">這段灰字在紫色背景上</p></div>
  <div id="outer-card" style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;width:240px">
    <div id="inner-card" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px">內層卡片</div>
  </div>
  <p style="text-align:center">這是一段置中的長段落，字數一定要超過四十個字才算命中，所以這裡繼續寫一些說明文字讓長度足夠。</p>
  <div id="empty"><p>無資料</p></div>
  <p id="err">發生錯誤</p>
  <div id="actions">
    <button style="background:#2563eb;color:#fff">儲存</button>
    <button style="background:#2563eb;color:#fff">刪除</button>
  </div>
</body></html>`;

const CLEAN_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body style="background:#fff;color:#111">
  <div>
    <button style="background:#2563eb;color:#fff">新增專案</button>
    <button style="background:#fff;color:#2563eb;border:1px solid #2563eb">匯出</button>
  </div>
  <label>客戶名稱 <input placeholder="例如 Acme"></label>
  <div role="dialog" style="display:block;width:320px;padding:12px;background:#fff">
    <p>要放棄變更嗎？</p>
    <button>放棄變更</button><button>繼續編輯</button>
  </div>
  <div>
    <span style="display:inline-block;width:10px;height:10px;background:#16a34a;border-radius:50%"></span>
    <span>已出貨</span>
  </div>
  <p style="color:#9ca3af">次要說明</p>
  <p style="color:#111">一般內文</p>
  <div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;width:240px">一張卡片</div>
  <p style="text-align:left">這是一段靠左的長段落，字數雖然超過四十個字，但是靠左對齊，不應該被當成置中長文。</p>
  <div><p>無資料</p><button>建立第一筆</button></div>
  <p hidden>發生錯誤</p>
  <p>數量不能是負數，請改成 1 以上。</p>
  <div>
    <button style="background:#2563eb;color:#fff">儲存</button>
    <button style="background:#fff;color:#b91c1c;border:1px solid #b91c1c">刪除</button>
  </div>
</body></html>`;

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolvePort(port)));
    });
  });
}

async function waitFor(fn, attempts = 40) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw last;
}

function slug(text) {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

function headings(md) {
  const counts = new Map();
  const found = new Set();
  for (const line of md.split('\n')) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    let id = slug(match[2]);
    const seen = counts.get(id) || 0;
    counts.set(id, seen + 1);
    if (seen > 0) id = `${id}-${seen}`;
    found.add(id);
  }
  return found;
}

test('anti-patterns.js is the eval source and ux-review points at it', () => {
  const source = read('scripts/anti-patterns.js').trimEnd();
  assert.match(source, /^\/\/ frontend-qa anti-patterns\n\(\(\) => \{/);
  assert.match(source, /\}\)\(\)\s*$/);
  const review = read('references/ux-review.md');
  assert.doesNotMatch(review, /```js\n\/\/ frontend-qa anti-patterns/);
  assert.match(review, /scripts\/anti-patterns\.js/);
  assert.match(review, /eval <t> --b64/);
  const probeDoc = read('references/probe.md');
  assert.match(probeDoc, /scripts\/anti-patterns\.js/);
  assert.doesNotMatch(probeDoc, /是同一份/);
  for (const [key, check] of CHECKS) {
    assert.match(source, new RegExp(key));
    assert.match(review, new RegExp(check));
  }
});

test('anti-patterns.md lists 12 patterns with a dimension and a detection method', () => {
  const doc = read('references/anti-patterns.md');
  for (const name of NAMES) assert.match(doc, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const [, check] of CHECKS) assert.match(doc, new RegExp(check));
  const evalCount = (doc.match(/`eval`/g) || []).length;
  assert.ok(evalCount >= 5, `expected at least 5 eval patterns, got ${evalCount}`);
  assert.match(doc, /目視/);
  assert.match(doc, /視覺層級|一致性|排版節奏|回饋|文案|效率|質感/);
});

test('standalone modes, design context, and templates are specified', () => {
  const skill = read('SKILL.md');
  const modes = read('references/modes.md');
  const memory = read('references/memory.md');
  const template = read('references/report-template.md');
  const probeDoc = read('references/probe.md');
  const probeJs = read('scripts/probe.mjs');
  for (const text of [skill, modes]) {
    assert.match(text, /audit/);
    assert.match(text, /critique/);
    assert.match(text, /advise/);
  }
  assert.match(skill, /references\/modes\.md/);
  assert.match(modes, /預設是 `完整`|沒指定就是 `完整`|預設.*`完整`/);
  assert.match(modes, /audit\.md/);
  assert.match(modes, /ux-review\.md/);
  assert.match(modes, /advise\.md/);
  assert.match(modes, /主觀評分/);
  assert.match(modes, /不開瀏覽器|不要開瀏覽器/);
  assert.match(modes, /state\/probe\.json/);
  assert.match(modes, /實際操作/);
  assert.match(memory, /design-context\.md/);
  assert.match(memory, /產品類型/);
  assert.match(memory, /目標使用者/);
  assert.match(memory, /品牌形容詞/);
  assert.match(memory, /參考產品/);
  assert.match(memory, /推測/);
  assert.match(read('references/ux-review.md'), /design-context\.md/);
  assert.match(template, /audit\.md/);
  assert.match(template, /advise\.md/);
  assert.match(template, /字級 7 種 → 定一套 5 級字級表/);
  assert.match(template, /三種按鈕圓角 → 統一成 token/);
  assert.match(probeJs, /anti-patterns\.js/);
  for (const [, check] of CHECKS) {
    assert.match(probeJs, new RegExp(check));
    assert.match(probeDoc, new RegExp(check));
  }
});

test('internal markdown links under the skill resolve', () => {
  const files = readdirSync(join(skillDir, 'references')).filter((name) => name.endsWith('.md'));
  files.push('SKILL.md');
  const errors = [];
  for (const name of files) {
    const path = name === 'SKILL.md' ? join(skillDir, name) : join(skillDir, 'references', name);
    const text = readFileSync(path, 'utf8');
    const dir = dirname(path);
    for (const match of text.matchAll(/\[(?:[^\]]*)\]\(([^)\s]+)\)/g)) {
      const raw = match[1];
      if (/^(https?:|mailto:)/.test(raw)) continue;
      const [filePart, anchor] = raw.split('#');
      const target = filePart ? resolve(dir, filePart) : path;
      let body;
      try {
        body = readFileSync(target, 'utf8');
      } catch {
        errors.push(`${name} -> missing ${raw}`);
        continue;
      }
      if (anchor && !headings(body).has(anchor)) errors.push(`${name} -> unresolved #${anchor} in ${raw}`);
    }
  }
  assert.deepEqual(errors, []);
});

test('eval anti-patterns fire on a hit page and stay quiet on a clean page', { timeout: 30000 }, async () => {
  const source = read('scripts/anti-patterns.js');
  const port = await freePort();
  const dataDir = mkdtempSync(join(tmpdir(), 'qa-chrome-'));
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${dataDir}`,
    'about:blank',
  ], { stdio: 'ignore' });
  try {
    const version = await waitFor(async () => {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    });
    const result = await evaluateBoth(version.webSocketDebuggerUrl, source);
    const hit = Object.fromEntries(CHECKS.map(([key, id]) => [id, result.hit[key]]));
    console.log(JSON.stringify({ hit }));
    assert.equal(result.hit.warning, null);
    assert.equal(result.clean.warning, null);
    for (const [key] of CHECKS) {
      assert.ok(Array.isArray(result.hit[key]) && result.hit[key].length >= 1, `${key} missed: ${JSON.stringify(result.hit[key])}`);
      assert.ok(result.hit[key].every((item) => /"/.test(item)), `${key} item has no element text`);
      assert.deepEqual(result.clean[key], [], `${key} false positive: ${JSON.stringify(result.clean[key])}`);
    }
  } finally {
    chrome.kill('SIGKILL');
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        rmSync(dataDir, { recursive: true, force: true });
        break;
      } catch (err) {
        if (err.code !== 'ENOTEMPTY' || attempt === 19) throw err;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }
});

const LATIN1_HTML = Buffer.concat([
  Buffer.from(`<!doctype html><html><head><meta charset="windows-1252"></head><body style="background:#fff">
  <!-- `, 'ascii'),
  Buffer.from([0xe9]),
  Buffer.from(` -->
  <div>
    <button style="background:#2563eb;color:#fff">Export</button>
    <button style="background:#2563eb;color:#fff">More</button>
  </div>
  <div role="dialog" aria-modal="true" style="display:block;width:320px;padding:12px;background:#fff">
    <p>Are you sure?</p>
    <button>OK</button><button>Cancel</button>
  </div>
  <div id="empty"><p>no data</p></div>
  <p id="err">error</p>
  <div>
    <button style="background:#2563eb;color:#fff">save</button>
    <button style="background:#2563eb;color:#fff">delete</button>
  </div>
</body></html>`, 'ascii'),
]);

test('non-UTF-8 pages skip CJK patterns and still check English', { timeout: 30000 }, async () => {
  const source = read('scripts/anti-patterns.js');
  assert.match(source, /document\.characterSet/);
  assert.match(read('scripts/probe.mjs'), /ap\?\.warning/);
  assert.match(read('scripts/probe.mjs'), /text-checks-skipped/);
  const httpPort = await freePort();
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=windows-1252' });
    res.end(LATIN1_HTML);
  });
  await new Promise((resolveListen) => server.listen(httpPort, '127.0.0.1', resolveListen));
  const cdpPort = await freePort();
  const dataDir = mkdtempSync(join(tmpdir(), 'qa-chrome-'));
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${dataDir}`,
    'about:blank',
  ], { stdio: 'ignore' });
  try {
    const version = await waitFor(async () => {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    });
    const page = await evaluateUrl(version.webSocketDebuggerUrl, source, `http://127.0.0.1:${httpPort}/`);
    console.log(JSON.stringify({
      charset: page.charset,
      warning: page.result.warning,
      genericDialogActions: page.result.genericDialogActions.length,
      emptyStateNoAction: page.result.emptyStateNoAction.length,
      vagueError: page.result.vagueError.length,
      destructiveLooksPrimary: page.result.destructiveLooksPrimary.length,
      multiplePrimaryButtons: page.result.multiplePrimaryButtons.length,
    }));
    assert.notEqual(String(page.charset).toLowerCase(), 'utf-8');
    assert.equal(typeof page.result.warning, 'string');
    assert.match(page.result.warning, new RegExp(page.charset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(page.result.warning, /不是 UTF-8/);
    assert.match(page.result.warning, /CJK/);
    assert.match(page.result.warning, /英文/);
    assert.doesNotMatch(page.result.warning, /已略過文字比對：generic-dialog-actions/);
    assert.ok(page.result.genericDialogActions.length >= 1, JSON.stringify(page.result.genericDialogActions));
    assert.ok(page.result.emptyStateNoAction.some((item) => /no data/.test(item)), JSON.stringify(page.result.emptyStateNoAction));
    assert.ok(page.result.vagueError.some((item) => /error/.test(item)), JSON.stringify(page.result.vagueError));
    assert.ok(page.result.destructiveLooksPrimary.some((item) => /delete/.test(item) && /save/.test(item)), JSON.stringify(page.result.destructiveLooksPrimary));
    assert.ok(page.result.multiplePrimaryButtons.length >= 1, 'non-text checks should still run');
    assert.match(read('references/probe.md'), /CJK/);
    assert.match(read('references/anti-patterns.md'), /CJK/);
    assert.match(read('references/ux-review.md'), /CJK/);
  } finally {
    chrome.kill('SIGKILL');
    await new Promise((resolveClose) => server.close(resolveClose));
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        rmSync(dataDir, { recursive: true, force: true });
        break;
      } catch (err) {
        if (err.code !== 'ENOTEMPTY' || attempt === 19) throw err;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }
});

async function evaluateBoth(wsUrl, source) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolveOpen, reject) => {
    ws.addEventListener('open', resolveOpen, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP websocket failed')), { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolveSend, rejectSend) => {
    const msgId = ++id;
    pending.set(msgId, { resolve: resolveSend, reject: rejectSend });
    ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
    const run = async (html) => {
      await send('Runtime.evaluate', {
        expression: `document.open(); document.write(${JSON.stringify(html)}); document.close();`,
      }, sessionId);
      const evaluated = await send('Runtime.evaluate', { expression: source, returnByValue: true }, sessionId);
      if (evaluated.exceptionDetails) {
        throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
      }
      return evaluated.result.value;
    };
    const hit = await run(HIT_HTML);
    const clean = await run(CLEAN_HTML);
    await send('Target.closeTarget', { targetId });
    return { hit, clean };
  } finally {
    ws.close();
  }
}

async function evaluateUrl(wsUrl, source, url) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolveOpen, reject) => {
    ws.addEventListener('open', resolveOpen, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP websocket failed')), { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolveSend, rejectSend) => {
    const msgId = ++id;
    pending.set(msgId, { resolve: resolveSend, reject: rejectSend });
    ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  try {
    const { targetId } = await send('Target.createTarget', { url });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
    await waitFor(async () => {
      const ready = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true }, sessionId);
      const href = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }, sessionId);
      if (ready.result.value !== 'complete') throw new Error(String(ready.result.value));
      if (!String(href.result.value).startsWith(url)) throw new Error(String(href.result.value));
      return true;
    });
    const charsetEval = await send('Runtime.evaluate', { expression: 'document.characterSet', returnByValue: true }, sessionId);
    const evaluated = await send('Runtime.evaluate', { expression: source, returnByValue: true }, sessionId);
    if (evaluated.exceptionDetails) {
      throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
    }
    await send('Target.closeTarget', { targetId });
    return { charset: charsetEval.result.value, result: evaluated.result.value };
  } finally {
    ws.close();
  }
}
