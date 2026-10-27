// Browser installer for evaluate_script. Secret values stay out of the tool result.
// Sensitive keys and credential-shaped values become "<masked len=N>".
// mask() truncates every other string to 80 characters.
// Pass key "cookie" so every cookie value is masked and the name can be kept separately.
(function installFrontendQaMask() {
  const SENSITIVE_KEY = /pass|pwd|secret|token|auth|session|sid|jwt|bearer|api[-_]?key|csrf|cookie/i;

  function looksLikeCredential(text) {
    if (/\s/.test(text)) return false;
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text)) {
      return /[A-Za-z]/.test(text) || text.length >= 20;
    }
    if (text.length >= 20 && /^[A-Fa-f0-9]+$/.test(text)) return true;
    if (text.length >= 20 && /^[A-Za-z0-9+/_=-]+$/.test(text)) return true;
    return false;
  }

  function mask(key, value) {
    const text = value == null ? '' : String(value);
    const keyText = key == null ? '' : String(key);
    if (SENSITIVE_KEY.test(keyText) || looksLikeCredential(text)) return '<masked len=' + text.length + '>';
    return text.length > 80 ? text.slice(0, 80) : text;
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
      if (SENSITIVE_KEY.test(keyText) || looksLikeCredential(value)) return '<masked len=' + value.length + '>';
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
