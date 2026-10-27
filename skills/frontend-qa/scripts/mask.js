// Browser installer for evaluate_script. Secret values stay out of the tool result.
// Sensitive keys and credential-shaped values become "<masked len=N>".
// Other strings stay intact up to 2000 characters. Longer ones keep the first 2000
// and append "…<truncated len=N>", where N is the original length.
// Pass key "cookie" so every cookie value is masked and the name can be kept separately.
(function installFrontendQaMask() {
  const SENSITIVE_WORDS = {
    pass: true,
    password: true,
    pwd: true,
    secret: true,
    token: true,
    auth: true,
    authorization: true,
    session: true,
    sid: true,
    jwt: true,
    bearer: true,
    apikey: true,
    csrf: true,
    xsrf: true,
    cookie: true,
  };
  const TRUNCATE_AT = 2000;

  // Whole words only: separators are _ - . and camelCase / PascalCase boundaries.
  function keyWords(key) {
    const raw = key == null ? '' : String(key);
    const spaced = raw
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    return spaced.split(/[_\-.\s]+/).filter(Boolean).map((word) => word.toLowerCase());
  }

  function isSensitiveKey(key) {
    const words = keyWords(key);
    for (let i = 0; i < words.length; i++) {
      if (SENSITIVE_WORDS[words[i]]) return true;
      if (words[i] === 'api' && words[i + 1] === 'key') return true;
    }
    return false;
  }

  function looksLikeCredential(text) {
    if (/[\s/?&]/.test(text)) return false;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return false;
    if (/^\d+$/.test(text)) return false;
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text)) {
      return /[A-Za-z]/.test(text) || text.length >= 20;
    }
    if (text.length >= 32 && /^[A-Fa-f0-9]+$/.test(text)) return true;
    if (text.length >= 32 && /^[A-Za-z0-9+_=-]+$/.test(text)) return true;
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
    out = out.replace(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, (match) => '<masked len=' + match.length + '>');
    out = out.replace(/[A-Za-z0-9+/_=-]{20,}/g, (match) => '<masked len=' + match.length + '>');
    return out.length > 80 ? out.slice(0, 80) : out;
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
