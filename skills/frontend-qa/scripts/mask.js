// Browser installer for evaluate_script. Secret values stay out of the tool result.
// Keys: case-insensitive substring match on secret stems, after an allowlist
// (author, inside, sidebar, consider, residual). "sid" matches only as a whole word.
// Allowlisted words are removed before the stem scan, so authorName stays clear.
// Values default to masked. A token is kept only when a release class matches.
// Order, per value (console splits on whitespace and on ：；，。「」（）):
// 1. Sensitive key -> mask the whole value.
// 2. "Bearer <v>", "<stem>=<v>", "<stem>: <v>" -> mask v.
// 3. URL (^[a-z][a-z0-9+.-]*://, parsed with new URL) -> keep scheme, host, and port.
//    Path uses the segment rule. Each query or fragment k=v masks v when k has a
//    stem or v is opaque. A bare fragment #x uses the segment rule. A fragment
//    whose segments are plain words stays, including a trailing colon (#undefined:).
// 4. Plain path (^/ or a/b) -> segment rule.
// 5. Release classes below -> keep. JWT shape eyJ<b64>.<b64>.<b64> is masked
//    before those classes. An identifier of word humps is kept even when opaque:
//    ^[A-Za-z][a-z]+(?:[A-Z][a-z]{2,})*(?:[A-Z]\d{1,3}|\d{1,3})?$
//    Each capital in a hump is followed by at least two lowercase letters. A
//    final hump may be a capital plus 1-3 digits (OrderFormContainerV2) or 1-3
//    digits. Word, SKU, host, and every member dot-part must also be not opaque.
// 6. A token of at least 20 characters from [A-Za-z0-9+/=_-] -> mask; otherwise keep.
// Segment rule: every path segment must be a name, number, UUID, bundle, or
// file:line:col, otherwise the whole token is masked. A name is a lowercase word,
// an identifier, or camel/kebab/snake with one capital or separator per chunk.
// One leading @ (npm scope) or one leading . (.vite, .pnpm) is allowed when the
// rest passes the name rule. Opaque: length at least 16 with no -_. and both
// cases plus a digit, a "=" pad, or hex of at least 20 characters that contains
// a digit.
// Other strings stay intact up to 2000 characters. Longer ones keep the first 2000
// and append "…<truncated len=N>", where N is the original length before masking.
// Pass key "cookie" so every cookie value is masked and the name can be kept separately.
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
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const NUMBER = /^-?\d+(\.\d+)?$/;
  const WORD = /^[A-Za-z][a-z0-9]*([A-Z_-][A-Za-z0-9]+)*$/;
  const STRICT_NAME = /^[A-Za-z][a-z0-9]*([A-Z_-][a-z0-9]+)*$/;
  // Word humps, plus an optional V2-style suffix. Exempt from the opaque check.
  const IDENTIFIER = /^[A-Za-z][a-z]+(?:[A-Z][a-z]{2,})*(?:[A-Z]\d{1,3}|\d{1,3})?$/;
  // Whitespace plus fullwidth colon/semicolon/comma/parentheses and ideographic quotes.
  const TOKEN_GAP = /[\s\uFF1A\uFF1B\uFF0C\u3002\u300C\u300D\uFF08\uFF09]/;
  const JWT = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
  const BUNDLE = /^[\w.-]+-[A-Za-z0-9_]{6,24}\.(?:js|mjs|css|map)$/;
  const FILE_LINE = /^[\w./-]+\.\w+(?::\d+){1,2}$/;
  const LONG_RUN = /^[A-Za-z0-9+/=_-]{20,}$/;
  const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//;

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

  function marker(text) {
    return '<masked len=' + text.length + '>';
  }

  function isOpaque(text) {
    if (!text) return false;
    if (text.indexOf('=') !== -1) return true;
    if (/[-_.]/.test(text)) return false;
    const hasUpper = /[A-Z]/.test(text);
    const hasLower = /[a-z]/.test(text);
    const hasDigit = /\d/.test(text);
    if (text.length >= 16 && hasUpper && hasLower && hasDigit) return true;
    if (text.length >= 20 && hasDigit && /[A-Fa-f]/.test(text) && /^[0-9A-Fa-f]+$/.test(text)) return true;
    return false;
  }

  function partOpaque(text) {
    const parts = String(text).split(/[-_]/);
    for (let i = 0; i < parts.length; i++) {
      if (isOpaque(parts[i])) return true;
    }
    return false;
  }

  function isUuid(text) {
    return UUID.test(text);
  }

  function isJwt(text) {
    return JWT.test(text);
  }

  function isSku(text) {
    return /^[A-Z]+[-_][A-Z0-9]+$/.test(text) || /^sku[-_][A-Za-z0-9_-]*$/i.test(text);
  }

  function isBundle(text) {
    return BUNDLE.test(text);
  }

  function isIdentifier(text) {
    return IDENTIFIER.test(text);
  }

  function isName(part) {
    if (isIdentifier(part)) return true;
    if (STRICT_NAME.test(part) && !partOpaque(part)) return true;
    if (/^[a-z0-9]+$/.test(part) && !isOpaque(part)) return true;
    return false;
  }

  function simpleSegmentOk(part) {
    if (!part) return false;
    if (isUuid(part) || NUMBER.test(part)) return true;
    return isName(part);
  }

  function isFileName(text) {
    if (isBundle(text)) return true;
    if (text.indexOf('.') === -1) return false;
    const parts = text.split('.');
    for (let i = 0; i < parts.length; i++) {
      if (!simpleSegmentOk(parts[i])) return false;
    }
    return true;
  }

  function isFileLine(text) {
    if (!FILE_LINE.test(text)) return false;
    const name = text.replace(/(?::\d+){1,2}$/, '');
    return isFileName(name);
  }

  function segmentOk(seg) {
    if (seg === '') return true;
    if (isUuid(seg) || isBundle(seg) || isFileLine(seg) || NUMBER.test(seg)) return true;
    if (isFileName(seg)) return true;
    if (simpleSegmentOk(seg)) return true;
    if ((seg.charAt(0) === '@' || seg.charAt(0) === '.') && isName(seg.slice(1))) return true;
    return false;
  }

  function segmentsOk(pathname) {
    const parts = String(pathname).split('/');
    for (let i = 0; i < parts.length; i++) {
      if (!segmentOk(parts[i])) return false;
    }
    return true;
  }

  function maskPairs(body) {
    return body.split('&').map((pair) => {
      const eq = pair.indexOf('=');
      if (eq < 0) return pair;
      const key = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (!value) return pair;
      if (isSensitiveKey(key) || isOpaque(value) || isJwt(value)) return key + '=' + marker(value);
      return pair;
    }).join('&');
  }

  function maskHash(hashWithMark) {
    const body = hashWithMark.slice(1);
    if (body.indexOf('=') === -1) {
      if (segmentsOk(body.charAt(0) === '/' ? body : '/' + body)) return hashWithMark;
      return '#' + marker(body);
    }
    return '#' + maskPairs(body);
  }

  function rewriteQueryAndHash(raw) {
    const hashAt = raw.indexOf('#');
    const queryAt = raw.indexOf('?');
    let out = raw;
    if (queryAt >= 0 && (hashAt < 0 || queryAt < hashAt)) {
      const qEnd = hashAt < 0 ? raw.length : hashAt;
      out = raw.slice(0, queryAt + 1) + maskPairs(raw.slice(queryAt + 1, qEnd)) + raw.slice(qEnd);
    }
    const hashAt2 = out.indexOf('#');
    if (hashAt2 >= 0) out = out.slice(0, hashAt2) + maskHash(out.slice(hashAt2));
    return out;
  }

  function maskUrl(raw) {
    if (!URL_SCHEME.test(raw)) return null;
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return null;
    }
    if (!segmentsOk(parsed.pathname)) return marker(raw);
    return rewriteQueryAndHash(raw);
  }

  function isPlainPath(text) {
    if (URL_SCHEME.test(text)) return false;
    const path = text.split(/[?#]/)[0];
    return path.indexOf('/') !== -1;
  }

  function maskPathToken(text) {
    const hashAt = text.indexOf('#');
    const queryAt = text.indexOf('?');
    let cut = text.length;
    if (queryAt >= 0) cut = Math.min(cut, queryAt);
    if (hashAt >= 0) cut = Math.min(cut, hashAt);
    if (!segmentsOk(text.slice(0, cut))) return marker(text);
    return rewriteQueryAndHash(text);
  }

  function isHost(text) {
    if (/^localhost$/i.test(text)) return true;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) return true;
    return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/i.test(text);
  }

  function hostOk(text) {
    if (!isHost(text)) return false;
    const labels = text.split('.');
    for (let i = 0; i < labels.length; i++) {
      const bits = labels[i].split('-');
      for (let j = 0; j < bits.length; j++) {
        if (bits[j] && isOpaque(bits[j])) return false;
      }
    }
    return true;
  }

  function isMember(text) {
    return /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(text);
  }

  function memberOk(text) {
    if (!isMember(text)) return false;
    const parts = text.split('.');
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i] || isOpaque(parts[i])) return false;
    }
    return true;
  }

  function released(text) {
    if (NUMBER.test(text) || isUuid(text) || isBundle(text) || isFileLine(text)) return true;
    if (isIdentifier(text)) return true;
    if (isSku(text) && !partOpaque(text)) return true;
    if (WORD.test(text) && !partOpaque(text)) return true;
    if (memberOk(text)) return true;
    if (hostOk(text)) return true;
    return false;
  }

  function maskAssignment(core) {
    const match = /^([A-Za-z_][\w.-]*)[:=]([\s\S]+)$/.exec(core);
    if (!match || !isSensitiveKey(match[1])) return null;
    return match[1] + core.charAt(match[1].length) + marker(match[2]);
  }

  function maskCore(core) {
    const assigned = maskAssignment(core);
    if (assigned != null) return assigned;
    const url = maskUrl(core);
    if (url != null) return url;
    if (core.charAt(0) === '?') return '?' + maskPairs(core.slice(1));
    if (core.charAt(0) === '#') return maskHash(core);
    if (isPlainPath(core)) return maskPathToken(core);
    if (isJwt(core)) return marker(core);
    if (released(core)) return core;
    if (LONG_RUN.test(core)) return marker(core);
    return core;
  }

  function splitEdge(token) {
    const leadMatch = /^[([{'"]+/.exec(token);
    const lead = leadMatch ? leadMatch[0] : '';
    const rest = token.slice(lead.length);
    const trailMatch = /[)\]}'",;.:]+$/.exec(rest);
    const trail = trailMatch ? trailMatch[0] : '';
    const core = rest.slice(0, rest.length - trail.length);
    return { lead: lead, core: core, trail: trail };
  }

  function maskToken(token) {
    const edge = splitEdge(token);
    if (!edge.core) return token;
    return edge.lead + maskCore(edge.core) + edge.trail;
  }

  function maskWholeToken(token) {
    const edge = splitEdge(token);
    if (!edge.core) return marker(token);
    return edge.lead + marker(edge.core) + edge.trail;
  }

  function isBearer(token) {
    return /^bearer$/i.test(splitEdge(token).core);
  }

  function isStemPrefix(token) {
    const edge = splitEdge(token);
    const source = edge.core + (edge.trail.charAt(0) === ':' ? ':' : '');
    const match = /^(.*?)[:=]$/.exec(source);
    if (!match) return false;
    return isSensitiveKey(match[1]);
  }

  function previousToken(parts, index) {
    for (let i = index - 1; i >= 0; i--) {
      if (i % 2 === 0 && parts[i]) return parts[i];
    }
    return '';
  }

  function maskText(text) {
    if (!TOKEN_GAP.test(text)) return maskToken(text);
    const parts = text.split(/([\s\uFF1A\uFF1B\uFF0C\u3002\u300C\u300D\uFF08\uFF09]+)/);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1 || parts[i] === '') continue;
      const prev = previousToken(parts, i);
      if (isBearer(prev) || (isStemPrefix(prev) && !isBearer(parts[i]))) {
        parts[i] = maskWholeToken(parts[i]);
        continue;
      }
      parts[i] = maskToken(parts[i]);
    }
    return parts.join('');
  }

  function truncate(out, originalLength) {
    if (out.length > TRUNCATE_AT) return out.slice(0, TRUNCATE_AT) + '…<truncated len=' + originalLength + '>';
    return out;
  }

  function mask(key, value) {
    const text = value == null ? '' : String(value);
    const keyText = key == null ? '' : String(key);
    if (isSensitiveKey(keyText)) return marker(text);
    return truncate(maskText(text), text.length);
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
      if (isSensitiveKey(keyText)) return marker(value);
      return maskText(value);
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
    if (kind === 'password' || kind === 'hidden') return marker(text);
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
    const original = text == null ? '' : String(text);
    return truncate(maskText(original), original.length);
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
