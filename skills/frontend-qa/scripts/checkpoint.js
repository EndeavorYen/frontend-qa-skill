// In-page checkpoint. Values are copied into IndexedDB and never returned.
// Install once per page load, after scripts/mask.js, and again after navigate_page.
// HttpOnly cookies and server state are not captured.
(function installFrontendQaCheckpoint() {
  const DB_NAME = '__frontend_qa_checkpoints';
  const STORE = 'checkpoints';

  function readCookies() {
    const raw = String(document.cookie || '');
    if (!raw.trim()) return [];
    const cookies = [];
    for (const part of raw.split(';')) {
      const trimmed = part.trim();
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      cookies.push({ name: trimmed.slice(0, eq), value: trimmed.slice(eq + 1) });
    }
    return cookies;
  }

  function clearCookies() {
    for (const cookie of readCookies()) {
      document.cookie = cookie.name + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
  }

  function writeCookies(cookies) {
    clearCookies();
    for (const cookie of cookies) {
      document.cookie = cookie.name + '=' + cookie.value + '; path=/';
    }
  }

  function dumpStorage(storage) {
    const out = {};
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key == null) continue;
      out[key] = storage.getItem(key);
    }
    return out;
  }

  function replaceStorage(storage, saved) {
    storage.clear();
    for (const key of Object.keys(saved || {})) storage.setItem(key, saved[key]);
  }

  function counts() {
    return {
      local: localStorage.length,
      session: sessionStorage.length,
      cookies: readCookies().length,
    };
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('indexedDB open failed'));
    });
  }

  function idbPut(db, value, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('indexedDB put failed'));
    });
  }

  function idbGet(db, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('indexedDB get failed'));
    });
  }

  async function saveCheckpoint(name) {
    const local = dumpStorage(localStorage);
    const session = dumpStorage(sessionStorage);
    const cookies = readCookies();
    const url = location.href;
    const db = await openDb();
    try {
      await idbPut(db, structuredClone({ url, local, session, cookies }), name);
    } finally {
      db.close();
    }
    return {
      name,
      url,
      keys: [...Object.keys(local), ...Object.keys(session)],
      cookieNames: cookies.map((cookie) => cookie.name),
      counts: {
        local: Object.keys(local).length,
        session: Object.keys(session).length,
        cookies: cookies.length,
      },
    };
  }

  async function restoreCheckpoint(name) {
    const before = counts();
    const db = await openDb();
    let saved;
    try {
      saved = await idbGet(db, name);
    } finally {
      db.close();
    }
    if (!saved) return { before, after: counts(), missing: true };
    replaceStorage(localStorage, saved.local);
    replaceStorage(sessionStorage, saved.session);
    writeCookies(saved.cookies || []);
    return { before, after: counts() };
  }

  function clearStorage() {
    const before = counts();
    localStorage.clear();
    sessionStorage.clear();
    clearCookies();
    return { before, after: counts() };
  }

  function deleteCheckpoints() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve({ deleted: true });
      request.onerror = () => reject(request.error || new Error('indexedDB delete failed'));
      request.onblocked = () => resolve({ deleted: false, blocked: true });
    });
  }

  globalThis.__frontendQaSaveCheckpoint = saveCheckpoint;
  globalThis.__frontendQaRestoreCheckpoint = restoreCheckpoint;
  globalThis.__frontendQaClearStorage = clearStorage;
  globalThis.__frontendQaDeleteCheckpoints = deleteCheckpoints;
})();
