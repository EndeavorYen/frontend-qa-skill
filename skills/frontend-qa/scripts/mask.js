// Browser installer for evaluate_script. Secret values stay out of the tool result.
// Keys: case-insensitive substring match on secret stems, after an allowlist
// (author, inside, sidebar, consider, residual). "sid" matches only as a whole word.
// Values: JWTs whose segments are base64url and whose first segment starts with "eyJ",
// and an opaque run of at least 20 characters from [A-Za-z0-9+/=_-] with both a letter
// and a digit. UUIDs, whitespace, paths starting with "/", URLs, and plain numbers stay clear.
// Other strings stay intact up to 2000 characters. Longer ones keep the first 2000
// and append "…<truncated len=N>", where N is the original length.
// Pass key "cookie" so every cookie value is masked and the name can be kept separately.
// Console text masks "Bearer <token>", those JWTs, and the same opaque runs.
// Dotted member names, hostnames, and file names stay intact.
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
    'passwd',
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
    const collapsed = lower.replace(/[^a-z0-9]/g, '');
    for (let i = 0; i < SECRET_STEMS.length; i++) {
      const stem = SECRET_STEMS[i];
      if (lower.includes(stem)) return true;
      const folded = stem.replace(/[^a-z0-9]/g, '');
      if (folded && collapsed.includes(folded)) return true;
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

  function isOpaqueToken(text) {
    if (!OPAQUE.test(text)) return false;
    if (!/[A-Za-z]/.test(text) || !/\d/.test(text)) return false;
    if (isUuid(text) || text.charAt(0) === '/' || isUrl(text) || /^\d+$/.test(text)) return false;
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

  function maskConsole(text) {
    let out = text == null ? '' : String(text);
    out = out.replace(/\bBearer\s+[A-Za-z0-9+/=_.-]+/gi, (match) => {
      const token = match.replace(/^Bearer\s+/i, '');
      return 'Bearer <masked len=' + token.length + '>';
    });
    out = out.replace(/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, (token) => {
      return isJwt(token) ? '<masked len=' + token.length + '>' : token;
    });
    out = out.replace(/[A-Za-z0-9+/=_-]{20,}/g, (token) => {
      return isOpaqueToken(token) ? '<masked len=' + token.length + '>' : token;
    });
    if (out.length > TRUNCATE_AT) return out.slice(0, TRUNCATE_AT) + '…<truncated len=' + out.length + '>';
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
