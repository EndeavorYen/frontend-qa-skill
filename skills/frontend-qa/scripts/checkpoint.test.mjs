import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsDir, '../../..');
const checkpointSource = readFileSync(new URL('./checkpoint.js', import.meta.url), 'utf8');

function createIndexedDB() {
  const databases = new Map();

  function createDb() {
    const stores = new Map();
    return {
      stores,
      objectStoreNames: { contains: (name) => stores.has(name) },
      createObjectStore(name) {
        const store = new Map();
        stores.set(name, store);
        return store;
      },
      transaction(name) {
        const store = stores.get(name);
        const tx = {};
        queueMicrotask(() => {
          if (typeof tx.oncomplete === 'function') tx.oncomplete();
        });
        tx.objectStore = () => ({
          put(value, key) {
            store.set(key, structuredClone(value));
          },
          get(key) {
            const request = {};
            queueMicrotask(() => {
              request.result = store.has(key) ? structuredClone(store.get(key)) : undefined;
              if (typeof request.onsuccess === 'function') request.onsuccess();
            });
            return request;
          },
        });
        return tx;
      },
      close() {},
    };
  }

  return {
    databases,
    open(name) {
      const request = {};
      queueMicrotask(() => {
        let db = databases.get(name);
        if (!db) {
          db = createDb();
          databases.set(name, db);
          request.result = db;
          if (typeof request.onupgradeneeded === 'function') request.onupgradeneeded();
        } else {
          request.result = db;
        }
        if (typeof request.onsuccess === 'function') request.onsuccess();
      });
      return request;
    },
    deleteDatabase(name) {
      const request = {};
      queueMicrotask(() => {
        databases.delete(name);
        if (typeof request.onsuccess === 'function') request.onsuccess();
      });
      return request;
    },
  };
}

function createDocument() {
  const jar = new Map();
  return {
    get cookie() {
      return [...jar.entries()].map(([name, value]) => name + '=' + value).join('; ');
    },
    set cookie(input) {
      const parts = String(input).split(';').map((part) => part.trim());
      const pair = parts[0] || '';
      const eq = pair.indexOf('=');
      if (eq <= 0) return;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1);
      const expired = parts.some((part) => {
        if (!/^expires=/i.test(part)) return false;
        return Date.parse(part.slice(part.indexOf('=') + 1)) < Date.now();
      });
      if (expired) jar.delete(name);
      else jar.set(name, value);
    },
  };
}

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }

  get length() {
    return this.map.size;
  }

  key(index) {
    return [...this.map.keys()][index] ?? null;
  }

  getItem(key) {
    const name = String(key);
    return this.map.has(name) ? this.map.get(name) : null;
  }

  setItem(key, value) {
    this.map.set(String(key), String(value));
  }

  removeItem(key) {
    this.map.delete(String(key));
  }

  clear() {
    this.map.clear();
  }
}

function install() {
  const context = {
    localStorage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
    document: createDocument(),
    indexedDB: createIndexedDB(),
    location: { href: 'https://app.test/orders' },
    structuredClone,
    Promise,
    queueMicrotask,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(checkpointSource, context);
  return context;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const TOKEN = 'super-secret-token-value-0123456789';
const SESSION_VALUE = 'sess-secret-value';
const COOKIE_VALUE = 'cookie-secret-value';
const THEME_VALUE = 'theme-value-dark';
const USER_VALUE = 'qa-user-value';

function assertValuesStayOut(result) {
  const blob = JSON.stringify(result);
  for (const secret of [TOKEN, SESSION_VALUE, COOKIE_VALUE, THEME_VALUE, USER_VALUE]) {
    assert.equal(blob.includes(secret), false, blob);
  }
  assert.doesNotMatch(blob, /<masked len=/);
}

test('save, mutate, and restore return key names and counts only', async () => {
  const page = install();
  page.localStorage.setItem('token', TOKEN);
  page.localStorage.setItem('user', USER_VALUE);
  page.sessionStorage.setItem('session', SESSION_VALUE);
  page.document.cookie = 'sid=' + COOKIE_VALUE + '; path=/';
  page.document.cookie = 'theme=' + THEME_VALUE + '; path=/';

  const saved = await page.__frontendQaSaveCheckpoint('clean');
  const savedPlain = plain(saved);
  assert.deepEqual(Object.keys(savedPlain).sort(), ['cookieNames', 'counts', 'keys', 'name', 'url']);
  assert.equal(savedPlain.name, 'clean');
  assert.equal(savedPlain.url, 'https://app.test/orders');
  assert.deepEqual(savedPlain.keys, ['token', 'user', 'session']);
  assert.deepEqual(savedPlain.cookieNames, ['sid', 'theme']);
  assert.deepEqual(savedPlain.counts, { local: 2, session: 1, cookies: 2 });
  assertValuesStayOut(saved);

  page.localStorage.clear();
  page.localStorage.setItem('other', 'changed');
  page.sessionStorage.clear();
  page.document.cookie = 'sid=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  page.document.cookie = 'theme=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  page.document.cookie = 'extra=1; path=/';

  const restored = plain(await page.__frontendQaRestoreCheckpoint('clean'));
  assert.deepEqual(Object.keys(restored).sort(), ['after', 'before']);
  assert.deepEqual(restored.before, { local: 1, session: 0, cookies: 1 });
  assert.deepEqual(restored.after, savedPlain.counts);
  assert.equal(page.localStorage.getItem('token'), TOKEN);
  assert.equal(page.localStorage.getItem('user'), USER_VALUE);
  assert.equal(page.localStorage.getItem('other'), null);
  assert.equal(page.sessionStorage.getItem('session'), SESSION_VALUE);
  assert.match(page.document.cookie, new RegExp('sid=' + COOKIE_VALUE));
  assert.match(page.document.cookie, new RegExp('theme=' + THEME_VALUE));
  assert.doesNotMatch(page.document.cookie, /extra=/);
  assertValuesStayOut(restored);
});

test('restore leaves other IndexedDB databases in place', async () => {
  const page = install();
  page.localStorage.setItem('token', TOKEN);
  await page.__frontendQaSaveCheckpoint('clean');
  await new Promise((resolve, reject) => {
    const request = page.indexedDB.open('app-db');
    request.onupgradeneeded = () => {
      request.result.createObjectStore('items');
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('items', 'readwrite');
      tx.objectStore('items').put({ keep: true }, 'row');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error || new Error('put failed'));
    };
    request.onerror = () => reject(request.error || new Error('open failed'));
  });
  page.localStorage.clear();
  await page.__frontendQaRestoreCheckpoint('clean');
  const kept = await new Promise((resolve, reject) => {
    const request = page.indexedDB.open('app-db');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('items', 'readonly');
      const get = tx.objectStore('items').get('row');
      get.onsuccess = () => {
        db.close();
        resolve(get.result);
      };
      get.onerror = () => reject(get.error || new Error('get failed'));
    };
    request.onerror = () => reject(request.error || new Error('reopen failed'));
  });
  assert.deepEqual(kept, { keep: true });
  assert.equal(page.indexedDB.databases.has('app-db'), true);
});

test('a missing checkpoint does not clear storage', async () => {
  const page = install();
  page.localStorage.setItem('token', TOKEN);
  const missing = plain(await page.__frontendQaRestoreCheckpoint('clean'));
  assert.equal(missing.missing, true);
  assert.deepEqual(missing.before, missing.after);
  assert.equal(page.localStorage.getItem('token'), TOKEN);
  assertValuesStayOut(missing);
});

test('clear returns counts only and keeps the checkpoint', async () => {
  const page = install();
  page.localStorage.setItem('token', TOKEN);
  page.sessionStorage.setItem('session', SESSION_VALUE);
  page.document.cookie = 'sid=' + COOKIE_VALUE + '; path=/';
  await page.__frontendQaSaveCheckpoint('clean');
  const cleared = plain(page.__frontendQaClearStorage());
  assert.deepEqual(cleared.before, { local: 1, session: 1, cookies: 1 });
  assert.deepEqual(cleared.after, { local: 0, session: 0, cookies: 0 });
  assertValuesStayOut(cleared);
  const restored = plain(await page.__frontendQaRestoreCheckpoint('clean'));
  assert.deepEqual(restored.after, { local: 1, session: 1, cookies: 1 });
  assert.equal(page.localStorage.getItem('token'), TOKEN);
});

test('delete removes the checkpoint store', async () => {
  const page = install();
  page.localStorage.setItem('token', TOKEN);
  await page.__frontendQaSaveCheckpoint('clean');
  const deleted = plain(await page.__frontendQaDeleteCheckpoints());
  assert.deepEqual(deleted, { deleted: true });
  const missing = await page.__frontendQaRestoreCheckpoint('clean');
  assert.equal(missing.missing, true);
  assert.equal(page.localStorage.getItem('token'), TOKEN);
});

test('storage reads stay inside the mask helper or the checkpoint scripts', () => {
  const result = spawnSync('rg', [
    '-n',
    '-i',
    'localStorage|sessionStorage|document\\.cookie|\\.value\\b',
    'skills',
    '-g',
    '!*.test.mjs',
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const bad = result.stdout.split('\n').filter(Boolean).filter((line) => {
    return !line.startsWith('skills/frontend-qa/scripts/mask.js:')
      && !line.startsWith('skills/frontend-qa/scripts/checkpoint.js:');
  });
  assert.deepEqual(bad, []);
});
