#!/usr/bin/env node
// frontend-qa 探測腳本：一次跑完不需要判斷的檢查，只輸出精簡 JSON。
// 用法：CDP_PORT=9222 node probe.mjs <probe.json> [--out probe-result.json]
// 需要 Node 22 以上（內建 WebSocket），零依賴。只連 CDP_PORT，不會自己開瀏覽器。
// 預設在隔離的 browser context 中執行，不會用到、也不會改動使用者其他分頁的 cookie 和登入狀態。
// 設定檔格式見 ../references/probe.md。

import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { browserAnchorExpression, browserFingerprintExpression } from './fingerprint.mjs';

const ANTI_PATTERNS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'anti-patterns.js'), 'utf8');
const ANTI_CHECKS = [
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

// A field is an env reference only when it is exactly { "env": "<NAME>" }.
export function isEnvRef(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === 'env' && typeof value.env === 'string' && value.env.length > 0;
}

// Replace { env } fields with the variable value. Missing or empty variables are listed and left unresolved.
export function resolveEnvRefs(value, env = process.env) {
  const missing = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (isEnvRef(node)) {
      const name = node.env;
      if (env[name] === undefined || env[name] === '') {
        missing.push(name);
        return node;
      }
      return env[name];
    }
    if (node && typeof node === 'object') {
      const out = {};
      for (const [key, child] of Object.entries(node)) out[key] = walk(child);
      return out;
    }
    return node;
  };
  const config = walk(value);
  return { config, missing: [...new Set(missing)] };
}

// Password keys that are still raw strings. The warning names the field, never the value.
export function plaintextPasswordFields(value, path = '') {
  const found = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => found.push(...plaintextPasswordFields(item, `${path}[${index}]`)));
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    const here = path ? `${path}.${key}` : key;
    if (/password/i.test(key) && typeof child === 'string') found.push(here);
    else found.push(...plaintextPasswordFields(child, here));
  }
  return found;
}

export function normalizePage(entry) {
  if (typeof entry === 'string') return { url: entry };
  if (entry && typeof entry === 'object' && typeof entry.url === 'string') {
    const page = { url: entry.url };
    if (typeof entry.anchor === 'string' && entry.anchor) page.anchor = entry.anchor;
    return page;
  }
  throw new Error(`pages 項目必須是網址字串或 { url, anchor }：${JSON.stringify(entry)}`);
}

// Record the fingerprint taken after the first viewport load, and an anchor-missing row when the anchor is absent.
export function notePageLoad({ fingerprints, results, url, anchor, fingerprint, anchorFound, viewport }) {
  if (fingerprint !== undefined) {
    if (!fingerprint || typeof fingerprint.hash !== 'string' || !Array.isArray(fingerprint.list)) {
      results.push({ check: 'probe-error', url, detail: '指紋：結果不是 { hash, list }' });
    } else {
      fingerprints[url] = { hash: fingerprint.hash, list: [...fingerprint.list] };
    }
  }
  if (anchor && anchorFound === false) {
    results.push({
      check: 'anchor-missing',
      url,
      viewport,
      detail: `找不到錨點 ${anchor}，網址沒變但內容可能已不是這個畫面`,
    });
  }
}

export function buildProbeOutput({ base, startedAt = Date.now(), results, fingerprints = {} }) {
  const summary = {};
  for (const r of results) summary[r.check] = (summary[r.check] || 0) + 1;
  return {
    probe: 'frontend-qa.probe.v1',
    base,
    seconds: Math.round((Date.now() - startedAt) / 1000),
    summary,
    fingerprints,
    results,
  };
}

// A new profile's first load asks for /favicon.ico and often gets 404. Other favicon failures stay.
export function noteFailedRequest(events, url, text, status) {
  let pathname = '';
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = '';
  }
  if (status === 404 && pathname === '/favicon.ico') return;
  events.failed.push(text);
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  try { return import.meta.url === pathToFileURL(realpathSync(entry)).href; } catch { return false; }
}

async function main() {
const args = process.argv.slice(2);
let configPath;
let outPath = 'probe-result.json';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') outPath = args[++i];
  else if (!args[i].startsWith('--')) configPath ??= args[i];
}
if (!configPath) {
  console.error('usage: CDP_PORT=<port> node probe.mjs <probe.json> [--out probe-result.json]');
  process.exit(2);
}
if (typeof WebSocket === 'undefined') {
  console.error('需要 Node 22 以上（內建 WebSocket）');
  process.exit(2);
}

const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
const plaintext = plaintextPasswordFields(parsed);
if (plaintext.length) {
  console.error(`警告：設定檔有明文密碼（${plaintext.join('、')}）。請改成 { "env": "QA_PASSWORD" }，不要把密碼寫進設定檔。`);
}
const { config, missing } = resolveEnvRefs(parsed);
if (missing.length) {
  console.error(`環境變數 ${missing.join('、')} 沒有設定。請先設定後再跑探測，不會帶空密碼登入。`);
  process.exit(2);
}
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
const commandTimeoutMs = config.commandTimeoutMs ?? 15000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const fingerprints = {};
const add = (check, url, detail, extra = {}) => results.push({ check, url, ...extra, detail });
const startedAt = Date.now();
const writeOut = () => {
  const out = buildProbeOutput({ base, startedAt, results, fingerprints });
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ out: outPath, seconds: out.seconds, summary: out.summary }));
};

// ---------- CDP（連 browser 端點，再 attach 到自己開的分頁） ----------
let ws;
let dead = false;
let msgId = 0;
let sessionId;
const pending = new Map();
const send = (method, params = {}, { browser = false } = {}) =>
  new Promise((resolve, reject) => {
    if (dead || ws.readyState !== WebSocket.OPEN) return reject(new Error('CDP 連線中斷'));
    const id = ++msgId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} 逾時（${commandTimeoutMs}ms）`));
    }, commandTimeoutMs);
    pending.set(id, {
      resolve: (v) => (clearTimeout(timer), resolve(v)),
      reject: (e) => (clearTimeout(timer), reject(e)),
    });
    ws.send(JSON.stringify({ id, method, params, ...(browser || !sessionId ? {} : { sessionId }) }));
  });

let events = { errors: [], failed: [], requests: [], dialogs: [] };
const inflight = new Set();
const reset = () => (events = { errors: [], failed: [], requests: [], dialogs: [] });
let mocks = [];
const isWrite = (m) => m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS';

const onEvent = ({ method, params }) => {
  if (method === 'Runtime.exceptionThrown') {
    const d = params.exceptionDetails;
    events.errors.push((d.exception?.description || d.text || '').split('\n')[0]);
  } else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    events.errors.push(params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  } else if (method === 'Network.requestWillBeSent') {
    inflight.add(params.requestId);
    // 重新導向會用同一個 requestId 再發一次事件，不要重複計算
    if (!params.redirectResponse) events.requests.push({ id: params.requestId, method: params.request.method, url: params.request.url });
  } else if (method === 'Network.responseReceived') {
    if (params.response.status >= 400) noteFailedRequest(events, params.response.url, `${params.response.status} ${params.response.url}`, params.response.status);
  } else if (method === 'Network.loadingFinished') {
    inflight.delete(params.requestId);
  } else if (method === 'Network.loadingFailed') {
    inflight.delete(params.requestId);
    const req = events.requests.find((r) => r.id === params.requestId);
    const failedUrl = req ? req.url : '';
    noteFailedRequest(events, failedUrl, `${params.errorText} ${failedUrl}`.trim());
  } else if (method === 'Page.javascriptDialogOpening') {
    // alert / confirm 會卡住頁面；記下文字當成回饋證據，一律按取消，不會誤確認刪除這類動作
    // beforeunload 要按確定，否則會擋住腳本自己的導覽
    if (params.type !== 'beforeunload') events.dialogs.push({ type: params.type, message: params.message.slice(0, 200) });
    send('Page.handleJavaScriptDialog', { accept: params.type === 'beforeunload' }).catch(() => {});
  } else if (method === 'Fetch.requestPaused') {
    const { requestId, request } = params;
    const rule = mocks.find((m) => request.url.includes(m.match) && (m.method === 'ANY' || (m.method === 'WRITE' ? isWrite(request.method) : m.method === request.method)));
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
};

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
  const nav = await send('Page.navigate', { url: abs(url) });
  if (nav.errorText) throw new Error(`無法載入 ${url}：${nav.errorText}`);
  await settle();
};
const setMocks = async (list) => {
  mocks = list;
  if (list.length) await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  else await send('Fetch.disable');
};
const setOffline = (offline) =>
  send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

// 每一項檢查各自處理錯誤：出錯只記一筆 probe-error，接著跑下一項
const step = async (label, url, fn) => {
  try {
    await fn();
  } catch (err) {
    if (dead) throw err; // 連線斷了，後面的檢查都不可能成功，直接中止
    add('probe-error', url, `${label}：${String(err.message || err).split('\n')[0]}`);
  }
};

// ---------- 頁面內的檢查 ----------
const PAGE_AUDIT = `(() => {
  const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity !== 0; };
  const byIds = (e) => (e.getAttribute('aria-labelledby') || '').split(/\\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' ').trim();
  const label = (e) => (e.getAttribute('aria-label') || byIds(e) || e.innerText || e.value || e.getAttribute('title') || e.getAttribute('alt') || e.getAttribute('placeholder') || (e.labels && e.labels[0] ? e.labels[0].innerText : '') || '').trim().replace(/\\s+/g, ' ').slice(0, 30);
  const desc = (e) => { const cls = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).join('.') : ''; return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + cls; };
  const parse = (c) => { const m = c.match(/[\\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.length < 4 || c[3] > 0.5) return c; } return [255, 255, 255]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const CONTROL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[onclick],[tabindex]';
  const focusable = (e) => e.matches('a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]');
  const pointer = (e) => getComputedStyle(e).cursor === 'pointer';
  // 游標樣式會繼承，只看最外層的可點元素，而且不在控制項裡面
  const clickable = [...document.querySelectorAll('body *')].filter((e) => visible(e) && pointer(e) && !(e.parentElement && pointer(e.parentElement)) && !e.parentElement?.closest(CONTROL + ',label'));
  const controls = [...document.querySelectorAll(CONTROL)].filter(visible);
  const smallTargets = controls.filter((e) => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; })
    .map((e) => { const r = e.getBoundingClientRect(); return desc(e) + ' "' + label(e) + '" ' + Math.round(r.width) + 'x' + Math.round(r.height); });
  const lowContrast = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!visible(e) || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const s = getComputedStyle(e);
    if (!/^rgba?\\(/.test(s.color)) continue;
    const r = ratio(parse(s.color), bgOf(e));
    const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && +s.fontWeight >= 700);
    if (r < (large ? 3 : 4.5)) lowContrast.push(desc(e) + ' "' + label(e) + '" ' + s.color + ' ' + r.toFixed(2) + ':1');
  }
  const notKeyboard = clickable.filter((e) => !focusable(e) && !e.closest('label')).map((e) => desc(e) + ' "' + label(e) + '"');
  const symbolOnly = (t) => /^[^\\p{L}\\p{N}]{1,3}$/u.test(t);
  const unnamed = [...new Set([...controls, ...clickable])].filter((e) => { const l = label(e); return !l || (symbolOnly(l) && !e.getAttribute('aria-label') && !byIds(e).trim() && !e.getAttribute('title')); })
    .map((e) => desc(e) + ' "' + (e.innerText || '').trim() + '"');
  const uniq = (a) => [...new Set(a)];
  return {
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth ? document.documentElement.scrollWidth + '>' + document.documentElement.clientWidth : null,
    smallTargets: uniq(smallTargets), lowContrast: uniq(lowContrast), notKeyboard: uniq(notKeyboard), unnamed: uniq(unnamed),
  };
})()`;
// 手機模擬時 innerWidth 會被內容撐大，要和 clientWidth 比
const OVERFLOW = 'document.documentElement.scrollWidth > document.documentElement.clientWidth ? document.documentElement.scrollWidth + ">" + document.documentElement.clientWidth : null';
const textNow = () => evaluate('document.body ? document.body.innerText : ""');
const ERROR_WORDS = new RegExp(config.errorWords || '錯誤|失敗|無法|重試|離線|error|fail|retry|offline|unable', 'i');
const LOADING_WORDS = new RegExp(config.loadingWords || '載入中|讀取中|loading|請稍候', 'i');
const sample = (list, n = 8) => (list.length > n ? [...list.slice(0, n), `…共 ${list.length} 筆`] : list);
const newLines = (before, after) => after.split('\n').filter((l) => l.trim() && !before.split('\n').includes(l)).join(' ').slice(0, 160);

const auditPage = async (url, kind, { withFingerprint = false, anchor } = {}) => {
  for (let i = 0; i < viewports.length; i++) {
    const vp = viewports[i];
    await step(`檢查 ${vp.name}`, url, async () => {
      await setViewport(vp);
      await go(url);
      if (i === 0 && withFingerprint) {
        let fp;
        try {
          fp = await evaluate(browserFingerprintExpression());
        } catch (err) {
          add('probe-error', url, `指紋：${String(err.message || err).split('\n')[0]}`);
        }
        let anchorFound;
        if (anchor) {
          try {
            anchorFound = await evaluate(browserAnchorExpression(anchor));
          } catch (err) {
            add('probe-error', url, `錨點：${String(err.message || err).split('\n')[0]}`);
          }
        }
        notePageLoad({ fingerprints, results, url, anchor, fingerprint: fp, anchorFound, viewport: vp.name });
      }
      const a = await evaluate(PAGE_AUDIT);
      const at = { viewport: vp.name };
      if (events.errors.length) add('console-error', url, sample([...new Set(events.errors)]), { ...at, kind });
      if (events.failed.length) add('failed-request', url, sample([...new Set(events.failed)]), at);
      if (a.overflowX) add('horizontal-overflow', url, `scrollWidth ${a.overflowX}`, at);
      if (a.smallTargets.length) add('small-target', url, sample(a.smallTargets), at);
      if (a.lowContrast.length) add('low-contrast', url, sample(a.lowContrast), at);
      if (a.notKeyboard.length) add('not-keyboard-reachable', url, sample(a.notKeyboard), at);
      if (a.unnamed.length) add('no-accessible-name', url, sample(a.unnamed), at);
      try {
        const ap = await evaluate(ANTI_PATTERNS);
        if (ap?.warning) add('text-checks-skipped', url, ap.warning, at);
        for (const [key, check] of ANTI_CHECKS) {
          if (ap?.[key]?.length) add(check, url, sample(ap[key]), at);
        }
      } catch (err) {
        add('probe-error', url, `anti-patterns: ${String(err.message || err).split('\n')[0]}`, at);
      }
    });
  }
};

// 填表：用原生 setter 再發 input / change，React、Vue 這類框架也收得到
const fillForm = async (fill) => {
  const missing = await evaluate(`(() => {
    const missing = [];
    for (const [sel, value] of Object.entries(${JSON.stringify(fill)})) {
      const el = document.querySelector(sel);
      if (!el) { missing.push(sel); continue; }
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLInputElement ? HTMLInputElement.prototype : null;
      if (proto) Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      else el.textContent = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return missing;
  })()`);
  if (missing.length) throw new Error(`找不到欄位：${missing.join(', ')}`);
};
const clickTimes = async (selector, times) => {
  const ok = await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return false; for (let i = 0; i < ${times}; i++) b.click(); return true; })()`);
  if (!ok) throw new Error(`找不到按鈕：${selector}`);
};
const writes = (match) => events.requests.filter((r) => r.url.includes(match) && isWrite(r.method));

// 先載入並填好表單，再套用情境（斷網、mock），最後送出，看畫面有沒有給任何回饋
const feedbackAfterSubmit = async (form, scenario, apply, undo) => {
  await go(form.url);
  await fillForm(form.fill);
  const before = await textNow();
  const urlBefore = await evaluate('location.href');
  let after = '';
  let urlAfter = '';
  try {
    await apply();
    reset();
    await clickTimes(form.submit, 1);
    await sleep(feedbackMs);
    after = await textNow().catch(() => '');
    urlAfter = await evaluate('location.href').catch(() => '');
  } finally {
    await undo();
  }
  if (events.dialogs.some((d) => d.type === 'confirm')) return add('skipped', form.url, `${scenario}：送出前要求確認，腳本按了取消，無法判斷`, { scenario });
  const dialogs = events.dialogs.map((d) => d.message).join('；');
  const added = newLines(before, after);
  if (dialogs) {
    if (!ERROR_WORDS.test(dialogs)) add('no-error-message', form.url, `${scenario}送出後跳出對話框，但沒有錯誤訊息：「${dialogs}」`, { scenario });
  } else if (after === before && urlAfter === urlBefore) {
    add('no-feedback', form.url, `${scenario}送出後 ${feedbackMs}ms 內畫面和網址都沒有變化`, { scenario });
  } else if (!ERROR_WORDS.test(added)) {
    add('no-error-message', form.url, `${scenario}送出後沒有出現錯誤訊息；新出現的文字：「${added}」；網址：${urlAfter}`, { scenario });
  }
};

// ---------- 執行 ----------
// 被外部中止時也寫出目前為止的結果
for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { add('probe-error', '', `被 ${sig} 中止`); writeOut(); process.exit(1); });
let browserContextId;
let targetId;
try {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`連不上 CDP_PORT ${port}`)), { once: true });
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method && msg.sessionId === sessionId) {
      onEvent(msg);
    }
  });
  ws.addEventListener('close', () => {
    dead = true;
    for (const { reject } of pending.values()) reject(new Error('CDP 連線中斷'));
    pending.clear();
  });

  if (config.isolate !== false) ({ browserContextId } = await send('Target.createBrowserContext', {}, { browser: true }));
  ({ targetId } = await send('Target.createTarget', { url: 'about:blank', ...(browserContextId ? { browserContextId } : {}) }, { browser: true }));
  ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }, { browser: true }));
  for (const domain of ['Page', 'Runtime', 'Network']) await send(`${domain}.enable`);

  for (const url of config.publicPages || []) await auditPage(url, 'page');

  if (config.login) {
    await setViewport(viewports[0]);
    await go(config.login.url);
    await fillForm(config.login.fill);
    await clickTimes(config.login.submit, 1);
    await settle();
    // 登入表單還在就當作登入失敗，後面的頁面檢查都會變成在檢查登入頁，所以直接停止
    const stillThere = await evaluate(`!!document.querySelector(${JSON.stringify(Object.keys(config.login.fill)[0])})`);
    if (stillThere) throw new Error(`登入後登入表單仍在畫面上，判定登入失敗：${events.dialogs.map((d) => d.message).join('；') || (await textNow()).slice(0, 80)}`);
  }

  for (const entry of config.pages || []) {
    const page = normalizePage(entry);
    await auditPage(page.url, 'page', { withFingerprint: true, anchor: page.anchor });
  }
  for (const url of config.records || []) await auditPage(url, 'record', { withFingerprint: true });

  await setViewport(viewports[0]);
  for (const list of config.lists || []) {
    // API 500：重新載入整頁。離線：重新載入會直接顯示瀏覽器的離線頁，所以只在 hash 路由時，
    // 先切到別的 hash 再切回來，讓 app 自己重新抓資料
    const hash = abs(list.url).split('#')[1];
    const scenarios = [['API 500', () => setMocks([{ match: list.api, status: 500, method: 'ANY' }]), () => setMocks([]), 'reload']];
    if (hash !== undefined) scenarios.push(['離線', () => setOffline(true), () => setOffline(false), 'hash']);
    else add('skipped', list.url, '不是 hash 路由，略過離線載入列表的檢查');
    for (const [scenario, apply, undo, how] of scenarios) {
      await step(`列表 ${scenario}`, list.url, async () => {
        await go(list.url);
        const before = await textNow();
        let text = '';
        try {
          await apply();
          reset();
          if (how === 'reload') await send('Page.reload', { ignoreCache: true });
          else await evaluate(`(async () => { location.hash = '#/__probe__'; await new Promise((r) => setTimeout(r, 300)); location.hash = ${JSON.stringify('#' + hash)}; })()`);
          await sleep(feedbackMs);
          text = await textNow().catch(() => '');
        } finally {
          await undo();
        }
        if (!events.requests.some((r) => r.url.includes(list.api))) {
          add('skipped', list.url, `${scenario}：重新進入列表時沒有發出 ${list.api} 請求（可能有快取），無法判斷`, { scenario });
          return;
        }
        // 只看情境套用後新出現的文字，避免導覽列或資料內容裡的字詞造成誤判
        const added = newLines(before, text);
        const feedback = added + ' ' + events.dialogs.map((d) => d.message).join(' ');
        if (LOADING_WORDS.test(text) && !ERROR_WORDS.test(feedback))
          add('stuck-loading', list.url, `${scenario}：${feedbackMs}ms 後仍顯示「${(text.match(LOADING_WORDS) || [''])[0]}」，沒有錯誤訊息`, { scenario });
        else if (!ERROR_WORDS.test(feedback)) add('no-error-message', list.url, `${scenario}：${feedbackMs}ms 後畫面沒有錯誤訊息`, { scenario });
      });
    }
  }

  for (const form of config.forms || []) {
    if (!form.allowSubmit) {
      add('skipped', form.url, '表單沒有設定 allowSubmit: true，略過送出類檢查');
      continue;
    }
    // 連點：同一個 task 內 click() 兩次，計算寫入請求數
    await step('連點送出', form.url, async () => {
      await go(form.url);
      await fillForm(form.fill);
      reset();
      await clickTimes(form.submit, 2);
      await sleep(Math.max(2500, settleMs));
      if (events.dialogs.some((d) => d.type === 'confirm')) return add('skipped', form.url, '連點送出：送出前要求確認，腳本按了取消，無法判斷');
      const n = writes(form.api).length;
      if (n > 1) add('double-submit', form.url, `連點兩下送出，發出 ${n} 個寫入請求（${form.api}）`);
    });
    // 斷網送出、API 回 500（預設攔截所有寫入方法，不會真的寫到後端）
    await step('離線送出', form.url, () => feedbackAfterSubmit(form, '離線', () => setOffline(true), () => setOffline(false)));
    await step('API 500 送出', form.url, () =>
      feedbackAfterSubmit(form, 'API 500 ', () => setMocks([{ match: form.api, status: 500, method: form.method || 'WRITE' }]), () => setMocks([])));
    // 超長輸入：只填不送，檢查各尺寸會不會撐破版面
    if (form.longField) {
      for (const vp of viewports) {
        await step(`超長輸入 ${vp.name}`, form.url, async () => {
          await setViewport(vp);
          await go(form.url);
          await fillForm({ ...form.fill, [form.longField]: 'W'.repeat(300) });
          await sleep(200);
          const o = await evaluate(OVERFLOW);
          if (o) add('horizontal-overflow', form.url, `欄位 ${form.longField} 填入 300 字元無空格字串後 scrollWidth ${o}`, { viewport: vp.name, scenario: '超長輸入' });
        });
      }
    }
  }
} catch (err) {
  add('probe-error', '', String(err.message || err).split('\n')[0]);
} finally {
  if (sessionId && !dead) {
    await setOffline(false).catch(() => {});
    await send('Fetch.disable').catch(() => {});
  }
  if (targetId && !dead) await send('Target.closeTarget', { targetId }, { browser: true }).catch(() => {});
  if (browserContextId && !dead) await send('Target.disposeBrowserContext', { browserContextId }, { browser: true }).catch(() => {});
  writeOut();
  ws?.close();
}
process.exit(0);
}

if (isMainModule()) await main();
