// Browser installer for evaluate_script. Secret values stay out of the tool result.
// Keys: case-insensitive substring match on secret stems, after an allowlist
// (author, inside, sidebar, consider, residual). "sid" matches only as a whole word.
// Allowlisted words are removed before the stem scan, so authorName stays clear.
// Values: JWTs whose segments are base64url and whose first segment starts with "eyJ",
// and an opaque run of at least 20 characters from [A-Za-z0-9+/=_-] with both a letter
// and a digit. UUIDs, whitespace, paths starting with "/", URLs, plain numbers, and
// SKU-like ids (sku- / sku_) stay clear.
// Other strings stay intact up to 2000 characters. Longer ones keep the first 2000
// and append "…<truncated len=N>", where N is the original length before masking.
// Pass key "cookie" so every cookie value is masked and the name can be kept separately.
// Console text masks "Bearer <token>", those JWTs, and standalone opaque runs.
// URLs (including host:port and the path), path segments, and file names (including
// hashed bundle names) are not opaque tokens. Dotted member names stay intact.
(function installFrontendQaMask() {
  const BENIGN_WORDS = {
    author: true,
    inside: true,
    sidebar: true,
    consider: true,
    residual: true,
  };
  const SECRET_STEMS = [
    'sess',
    'csrf',
    'xsrf',
    'passw',
    'pwd',
    'secret',
    'token',
    'bearer',
    'apikey',
    'api_key',
    'auth',
    'cookie',
    'jwt',
  ];
  const TRUNCATE_AT = 2000;
  const OPAQUE = /^[A-Za-z0-9+/=_-]{20,}$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const B64URL = /^[A-Za-z0-9_-]+$/;

  // Separators are _ - . and camelCase / PascalCase boundaries.
  function keyWords(key) {
    const raw = key == null ? '' : String(key);
    const spaced = raw
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    return spaced.split(/[_\-.\s]+/).filter(Boolean).map((word) => word.toLowerCase());
  }

  function isSensitiveKey(key) {
    const raw = key == null ? '' : String(key);
    const lower = raw.toLowerCase();
    const words = keyWords(raw);
    if (BENIGN_WORDS[lower]) return false;
    if (words.length > 0 && words.every((word) => BENIGN_WORDS[word])) return false;
    if (words.some((word) => word === 'sid')) return true;
    // A stem inside an allowlisted word (auth inside author) is not a secret key.
    const haystack = words.filter((word) => !BENIGN_WORDS[word]).join('');
    for (let i = 0; i < SECRET_STEMS.length; i++) {
      const stem = SECRET_STEMS[i];
      if (haystack.includes(stem)) return true;
      const folded = stem.replace(/[^a-z0-9]/g, '');
      if (folded && haystack.includes(folded)) return true;
    }
    return false;
  }

  function isUuid(text) {
    return UUID.test(text);
  }

  function isUrl(text) {
    return /^https?:\/\//i.test(text);
  }

  function isJwt(text) {
    const parts = text.split('.');
    if (parts.length !== 3 || !parts[0].startsWith('eyJ')) return false;
    for (let i = 0; i < parts.length; i++) {
      if (!B64URL.test(parts[i])) return false;
    }
    return true;
  }

  function isSkuLike(text) {
    return /^sku[-_][A-Za-z0-9_-]*$/i.test(text);
  }

  function isPathLike(text) {
    return /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+$/.test(text);
  }

  function isOpaqueToken(text) {
    if (!OPAQUE.test(text)) return false;
    if (!/[A-Za-z]/.test(text) || !/\d/.test(text)) return false;
    if (isUuid(text) || text.charAt(0) === '/' || isUrl(text) || /^\d+$/.test(text)) return false;
    if (isSkuLike(text)) return false;
    return true;
  }

  function looksLikeCredential(text) {
    if (/\s/.test(text) || isUuid(text) || text.charAt(0) === '/' || isUrl(text) || /^\d+$/.test(text)) return false;
    if (isJwt(text) || isOpaqueToken(text)) return true;
    return false;
  }

  function mask(key, value) {
    const text = value == null ? '' : String(value);
    const keyText = key == null ? '' : String(key);
    if (isSensitiveKey(keyText) || looksLikeCredential(text)) return '<masked len=' + text.length + '>';
    if (text.length > TRUNCATE_AT) return text.slice(0, TRUNCATE_AT) + '…<truncated len=' + text.length + '>';
    return text;
  }

  function maskResult(value, key) {
    const keyText = key == null ? '' : String(key);
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') return mask(keyText, value);
    if (Array.isArray(value)) return value.map((item) => maskResult(item, keyText));
    if (typeof value === 'object') {
      const out = {};
      for (const entry of Object.entries(value)) out[entry[0]] = maskResult(entry[1], entry[0]);
      return out;
    }
    return mask(keyText, String(value));
  }

  // Like maskResult, but leaves ordinary strings intact for probes that still compare page text.
  function maskSecrets(value, key) {
    const keyText = key == null ? '' : String(key);
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (isSensitiveKey(keyText) || looksLikeCredential(value)) return '<masked len=' + value.length + '>';
      return value;
    }
    if (Array.isArray(value)) return value.map((item) => maskSecrets(item, keyText));
    if (typeof value === 'object') {
      const out = {};
      for (const entry of Object.entries(value)) out[entry[0]] = maskSecrets(entry[1], entry[0]);
      return out;
    }
    return String(value);
  }

  function maskControl(type, key, value) {
    const text = value == null ? '' : String(value);
    const kind = String(type || '').toLowerCase();
    if (kind === 'password' || kind === 'hidden') return '<masked len=' + text.length + '>';
    return mask(key, text);
  }

  function maskElement(element) {
    if (!element || !('value' in element)) return '';
    const type = String(element.getAttribute('type') || '').toLowerCase();
    const key = element.getAttribute('name') || element.id || type || 'value';
    const raw = element.value == null ? '' : String(element.value);
    return maskControl(type, key, raw);
  }

  function enclosingSpan(whole, offset, length) {
    let start = offset;
    let end = offset + length;
    while (start > 0 && !/\s/.test(whole.charAt(start - 1))) start -= 1;
    while (end < whole.length && !/\s/.test(whole.charAt(end))) end += 1;
    return whole.slice(start, end);
  }

  function isHashedFileTail(whole, offset, length) {
    const after = whole.slice(offset + length);
    return /^\.(?:js|mjs|cjs|jsx|ts|tsx|css|map|vue|html|htm|json|wasm|svg)(?::\d+)?(?=$|[\s:)\],;])/i.test(after);
  }

  // Keep URL / host:port / path segments and hashed bundle file names.
  // Standalone tokens and values after a credential key or Bearer still mask.
  function keepConsoleRun(whole, offset, token) {
    if (isPathLike(token) || isSkuLike(token)) return true;
    if (isHashedFileTail(whole, offset, token.length)) return true;
    if (offset > 0 && whole.charAt(offset - 1) === '/') return true;
    const span = enclosingSpan(whole, offset, token.length)
      .replace(/^[('"[]+/, '')
      .replace(/[)'"\],;]+$/g, '');
    return /^https?:\/\//i.test(span);
  }

  function maskUrlQuery(url) {
    const q = url.indexOf('?');
    if (q < 0) return url;
    const hash = url.indexOf('#', q);
    const head = url.slice(0, q + 1);
    const query = url.slice(q + 1, hash < 0 ? url.length : hash);
    const tail = hash < 0 ? '' : url.slice(hash);
    const masked = query.split('&').map((pair) => {
      const eq = pair.indexOf('=');
      if (eq < 0) return pair;
      const key = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (!value) return pair;
      if (isSensitiveKey(key) || isJwt(value) || isOpaqueToken(value)) {
        return key + '=<masked len=' + value.length + '>';
      }
      return pair;
    }).join('&');
    return head + masked + tail;
  }

  function maskConsole(text) {
    const original = text == null ? '' : String(text);
    let out = original.replace(/\bBearer\s+[A-Za-z0-9+/=_.-]+/gi, (match) => {
      const token = match.replace(/^Bearer\s+/i, '');
      return 'Bearer <masked len=' + token.length + '>';
    });
    out = out.replace(/https?:\/\/[^\s)]+/gi, (url) => maskUrlQuery(url));
    out = out.replace(/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, (token, offset, whole) => {
      if (!isJwt(token) || keepConsoleRun(whole, offset, token)) return token;
      return '<masked len=' + token.length + '>';
    });
    out = out.replace(/[A-Za-z0-9+/=_-]{20,}/g, (token, offset, whole) => {
      if (!isOpaqueToken(token) || keepConsoleRun(whole, offset, token)) return token;
      return '<masked len=' + token.length + '>';
    });
    if (out.length > TRUNCATE_AT) return out.slice(0, TRUNCATE_AT) + '…<truncated len=' + original.length + '>';
    return out;
  }

  function maskConsoleArg(arg) {
    const raw = arg && arg.value != null ? arg.value : (arg && arg.description) || '';
    return maskConsole(raw);
  }

  function maskEvaluateResult(remote) {
    if (!remote || typeof remote !== 'object') return remote;
    return maskSecrets(remote.value);
  }

  globalThis.__frontendQaMask = mask;
  globalThis.__frontendQaMaskResult = maskResult;
  globalThis.__frontendQaMaskControl = maskControl;
  globalThis.__frontendQaMaskElement = maskElement;
  globalThis.__frontendQaMaskConsole = maskConsole;
  globalThis.__frontendQaMaskConsoleArg = maskConsoleArg;
  globalThis.__frontendQaMaskEvaluateResult = maskEvaluateResult;
})();
