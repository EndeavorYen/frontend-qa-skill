#!/usr/bin/env node
// frontend-qa 探測腳本：一次跑完不需要判斷的檢查，只輸出精簡 JSON。
// 用法：CDP_PORT=9222 node probe.mjs <probe.json> [--out probe-result.json]
// 需要 Node 22 以上（內建 WebSocket），零依賴。只連 CDP_PORT，不會自己開瀏覽器。
// 設定檔格式見 ../references/probe.md。

import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const configPath = args.find((a) => !a.startsWith('--'));
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : 'probe-result.json';
if (!configPath) {
  console.error('usage: CDP_PORT=<port> node probe.mjs <probe.json> [--out probe-result.json]');
  process.exit(2);
}
if (typeof WebSocket === 'undefined') {
  console.error('需要 Node 22 以上（內建 WebSocket）');
  process.exit(2);
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const port = process.env.CDP_PORT || config.cdpPort;
if (!port) {
  console.error('請設定 CDP_PORT');
  process.exit(2);
}
const base = config.base.replace(/\/$/, '');
const abs = (u) => (/^https?:/.test(u) ? u : base + (u.startsWith('/') ? u : '/' + u));
const viewports = (config.viewports || ['1440x900', '390x844']).map((v) => {
  const [width, height] = v.split('x').map(Number);
  return { name: v, width, height };
});
const settleMs = config.settleMs ?? 600;
const feedbackMs = config.feedbackMs ?? 5000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const add = (check, url, detail, extra = {}) => results.push({ check, url, ...extra, detail });

// ---------- CDP ----------
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
let msgId = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(`${msg.error.message}`)) : resolve(msg.result);
  } else if (msg.method) {
    for (const fn of listeners) fn(msg);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

// 網路與 console 紀錄
let events = { errors: [], failed: [], requests: [] };
const inflight = new Set();
const reset = () => (events = { errors: [], failed: [], requests: [] });
listeners.push(({ method, params }) => {
  if (method === 'Runtime.exceptionThrown') {
    const d = params.exceptionDetails;
    events.errors.push((d.exception?.description || d.text || '').split('\n')[0]);
  } else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    events.errors.push(params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  } else if (method === 'Network.requestWillBeSent') {
    inflight.add(params.requestId);
    events.requests.push({ id: params.requestId, method: params.request.method, url: params.request.url });
  } else if (method === 'Network.responseReceived') {
    if (params.response.status >= 400) events.failed.push(`${params.response.status} ${params.response.url}`);
  } else if (method === 'Network.loadingFinished') {
    inflight.delete(params.requestId);
  } else if (method === 'Network.loadingFailed') {
    inflight.delete(params.requestId);
    const req = events.requests.find((r) => r.id === params.requestId);
    events.failed.push(`${params.errorText} ${req ? req.url : ''}`.trim());
  } else if (method === 'Fetch.requestPaused') {
    const { requestId, request } = params;
    const rule = mocks.find((m) => request.url.includes(m.match) && (!m.method || m.method === request.method));
    if (rule) {
      send('Fetch.fulfillRequest', {
        requestId,
        responseCode: rule.status,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from('{"error":"probe mock"}').toString('base64'),
      }).catch(() => {});
    } else {
      send('Fetch.continueRequest', { requestId }).catch(() => {});
    }
  }
});

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
// 等到沒有進行中的請求，最多 maxMs
const settle = async (maxMs = 5000) => {
  const start = Date.now();
  await sleep(settleMs);
  while (Date.now() - start < maxMs) {
    const ready = await evaluate('document.readyState').catch(() => 'loading');
    if (ready === 'complete' && inflight.size === 0) return;
    await sleep(150);
  }
};
const setViewport = (vp) =>
  send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.width < 600 });
// hash 路由只改 hash 時不會重新載入，所以先回到 about:blank 再進入，讓每次都是乾淨的載入
const go = async (url) => {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(100);
  inflight.clear();
  reset();
  await send('Page.navigate', { url: abs(url) });
  await settle();
};
let mocks = [];
const setMocks = async (list) => {
  mocks = list;
  if (list.length) await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  else await send('Fetch.disable');
};
const setOffline = (offline) =>
  send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

// ---------- 頁面內的檢查 ----------
const PAGE_AUDIT = `(() => {
  const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity !== 0; };
  const label = (e) => (e.getAttribute('aria-label') || e.innerText || e.value || e.getAttribute('title') || e.getAttribute('alt') || '').trim().replace(/\\s+/g, ' ').slice(0, 30);
  const desc = (e) => { const cls = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).join('.') : ''; return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + cls; };
  const parse = (c) => { const m = c.match(/[\\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.length < 4 || c[3] > 0.5) return c; } return [255, 255, 255]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const focusable = (e) => e.matches('a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]');
  const controls = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link],[onclick],[tabindex]')].filter(visible);
  const smallTargets = controls.filter((e) => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; })
    .map((e) => { const r = e.getBoundingClientRect(); return desc(e) + ' "' + label(e) + '" ' + Math.round(r.width) + 'x' + Math.round(r.height); });
  const lowContrast = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!visible(e) || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const s = getComputedStyle(e);
    const fg = parse(s.color);
    const r = ratio(fg, bgOf(e));
    const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && +s.fontWeight >= 700);
    if (r < (large ? 3 : 4.5)) lowContrast.push(desc(e) + ' "' + label(e) + '" ' + s.color + ' ' + r.toFixed(2) + ':1');
  }
  const notKeyboard = [...document.querySelectorAll('body *')].filter((e) => visible(e) && getComputedStyle(e).cursor === 'pointer' && !focusable(e) && !e.closest('a[href],button,label,summary') && !(e.parentElement && getComputedStyle(e.parentElement).cursor === 'pointer'))
    .map((e) => desc(e) + ' "' + label(e) + '"');
  const unnamed = controls.filter((e) => !label(e) && !(e.labels && e.labels.length) && !e.getAttribute('placeholder') && !e.getAttribute('aria-labelledby'))
    .map((e) => desc(e));
  const iconOnly = [...controls, ...document.querySelectorAll('body *')].filter((e) => visible(e) && getComputedStyle(e).cursor === 'pointer' && !e.getAttribute('aria-label') && /^[^\\p{L}\\p{N}]{1,3}$/u.test((e.innerText || '').trim()))
    .map((e) => desc(e) + ' "' + (e.innerText || '').trim() + '"');
  const uniq = (a) => [...new Set(a)];
  return {
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth ? document.documentElement.scrollWidth + '>' + document.documentElement.clientWidth : null,
    smallTargets: uniq(smallTargets), lowContrast: uniq(lowContrast), notKeyboard: uniq(notKeyboard),
    unnamed: uniq([...unnamed, ...iconOnly]),
  };
})()`;
// 手機模擬時 innerWidth 會被內容撐大，要和 clientWidth 比
const OVERFLOW = 'document.documentElement.scrollWidth > document.documentElement.clientWidth ? document.documentElement.scrollWidth + ">" + document.documentElement.clientWidth : null';
const textNow = () => evaluate('document.body ? document.body.innerText : ""');
const ERROR_WORDS = new RegExp(config.errorWords || '錯誤|失敗|無法|重試|離線|error|fail|retry|offline|unable', 'i');
const LOADING_WORDS = new RegExp(config.loadingWords || '載入中|讀取中|loading|請稍候', 'i');
const sample = (list, n = 8) => (list.length > n ? [...list.slice(0, n), `…共 ${list.length} 筆`] : list);

const auditPage = async (url, kind) => {
  for (const vp of viewports) {
    await setViewport(vp);
    await go(url);
    const a = await evaluate(PAGE_AUDIT);
    const at = { viewport: vp.name };
    if (events.errors.length) add('console-error', url, sample([...new Set(events.errors)]), { ...at, kind });
    if (events.failed.length) add('failed-request', url, sample([...new Set(events.failed)]), at);
    if (a.overflowX) add('horizontal-overflow', url, `scrollWidth ${a.overflowX}`, at);
    if (a.smallTargets.length) add('small-target', url, sample(a.smallTargets), at);
    if (a.lowContrast.length) add('low-contrast', url, sample(a.lowContrast), at);
    if (a.notKeyboard.length) add('not-keyboard-reachable', url, sample(a.notKeyboard), at);
    if (a.unnamed.length) add('no-accessible-name', url, sample(a.unnamed), at);
  }
};

// 填表：用原生 setter 再發 input / change，React、Vue 這類框架也收得到
const fillForm = (fill) =>
  evaluate(`(() => {
    const missing = [];
    for (const [sel, value] of Object.entries(${JSON.stringify(fill)})) {
      const el = document.querySelector(sel);
      if (!el) { missing.push(sel); continue; }
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return missing;
  })()`);
const clickTimes = (selector, times) =>
  evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return false; for (let i = 0; i < ${times}; i++) b.click(); return true; })()`);
const writes = (match) => events.requests.filter((r) => r.url.includes(match) && r.method !== 'GET' && r.method !== 'OPTIONS');

// 送出後畫面有沒有給任何回饋
// 先載入並填好表單，再套用情境（斷網、mock），最後送出
const feedbackAfterSubmit = async (form, scenario, apply, undo) => {
  await go(form.url);
  const missing = await fillForm(form.fill);
  if (missing.length) return add('probe-error', form.url, `找不到欄位：${missing.join(', ')}`, { scenario });
  const before = await textNow();
  const urlBefore = await evaluate('location.href');
  await apply();
  let after = '';
  let urlAfter = '';
  try {
    await clickTimes(form.submit, 1);
    await sleep(feedbackMs);
    after = await textNow().catch(() => '');
    urlAfter = await evaluate('location.href').catch(() => '');
  } finally {
    await undo();
  }
  const changed = after !== before || urlAfter !== urlBefore;
  const newText = after.split('\n').filter((l) => !before.includes(l)).join(' ').slice(0, 120);
  if (!changed) add('no-feedback', form.url, `${scenario}送出後 ${feedbackMs}ms 內畫面和網址都沒有變化`, { scenario });
  else if (!ERROR_WORDS.test(newText)) add('no-error-message', form.url, `${scenario}送出後沒有出現錯誤訊息；新出現的文字：「${newText}」；網址：${urlAfter}`, { scenario });
};

// ---------- 執行 ----------
const startedAt = Date.now();
try {
  for (const url of config.publicPages || []) await auditPage(url, 'page');

  if (config.login) {
    await setViewport(viewports[0]);
    await go(config.login.url);
    const missing = await fillForm(config.login.fill);
    if (missing.length) throw new Error(`登入欄位找不到：${missing.join(', ')}`);
    await clickTimes(config.login.submit, 1);
    await settle();
  }

  for (const url of config.pages || []) await auditPage(url, 'page');
  for (const url of config.records || []) await auditPage(url, 'record');

  await setViewport(viewports[0]);
  for (const list of config.lists || []) {
    // API 500：重新載入整頁。離線：重新載入會直接顯示瀏覽器的離線頁，所以只在 hash 路由時，
    // 先切到別的 hash 再切回來，讓 app 自己重新抓資料
    const hash = abs(list.url).split('#')[1];
    const scenarios = [['API 500', () => setMocks([{ match: list.api, status: 500 }]), () => setMocks([]), 'reload']];
    if (hash !== undefined) scenarios.push(['離線', () => setOffline(true), () => setOffline(false), 'hash']);
    else add('skipped', list.url, '不是 hash 路由，略過離線載入列表的檢查');
    for (const [scenario, apply, undo, how] of scenarios) {
      await go(list.url);
      await apply();
      reset();
      if (how === 'reload') await send('Page.reload', { ignoreCache: true });
      else await evaluate(`(async () => { location.hash = '#/__probe__'; await new Promise((r) => setTimeout(r, 300)); location.hash = ${JSON.stringify('#' + hash)}; })()`);
      await sleep(feedbackMs);
      const text = await textNow().catch(() => '');
      await undo();
      if (LOADING_WORDS.test(text) && !ERROR_WORDS.test(text))
        add('stuck-loading', list.url, `${scenario}：${feedbackMs}ms 後仍顯示「${(text.match(LOADING_WORDS) || [''])[0]}」，沒有錯誤訊息`, { scenario });
      else if (!ERROR_WORDS.test(text)) add('no-error-message', list.url, `${scenario}：${feedbackMs}ms 後畫面沒有錯誤訊息`, { scenario });
    }
  }

  for (const form of config.forms || []) {
    if (!form.allowSubmit) {
      add('skipped', form.url, '表單沒有設定 allowSubmit: true，略過送出類檢查');
      continue;
    }
    // 連點：同一個 task 內 click() 兩次，計算寫入請求數
    await go(form.url);
    const missing = await fillForm(form.fill);
    if (missing.length) add('probe-error', form.url, `找不到欄位：${missing.join(', ')}`);
    else {
      reset();
      await clickTimes(form.submit, 2);
      await sleep(Math.max(2500, settleMs));
      const n = writes(form.api).length;
      if (n > 1) add('double-submit', form.url, `連點兩下送出，發出 ${n} 個寫入請求（${form.api}）`);
    }
    // 斷網送出、API 回 500
    await feedbackAfterSubmit(form, '離線', () => setOffline(true), () => setOffline(false));
    await feedbackAfterSubmit(form, 'API 500 ', () => setMocks([{ match: form.api, status: 500, method: form.method || 'POST' }]), () => setMocks([]));
    // 超長輸入：只填不送，檢查各尺寸會不會撐破版面
    if (form.longField) {
      for (const vp of viewports) {
        await setViewport(vp);
        await go(form.url);
        await fillForm({ ...form.fill, [form.longField]: 'W'.repeat(300) });
        await sleep(200);
        const o = await evaluate(OVERFLOW);
        if (o) add('horizontal-overflow', form.url, `欄位 ${form.longField} 填入 300 字元無空格字串後 scrollWidth ${o}`, { viewport: vp.name, scenario: '超長輸入' });
      }
    }
  }
} catch (err) {
  add('probe-error', '', String(err.message || err));
} finally {
  await setOffline(false).catch(() => {});
  await send('Fetch.disable').catch(() => {});
  await send('Emulation.clearDeviceMetricsOverride').catch(() => {});
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {});
}

const summary = {};
for (const r of results) summary[r.check] = (summary[r.check] || 0) + 1;
const out = { probe: 'frontend-qa.probe.v1', base, seconds: Math.round((Date.now() - startedAt) / 1000), summary, results };
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ out: outPath, seconds: out.seconds, summary }));
process.exit(0);
