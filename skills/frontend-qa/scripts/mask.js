// maskText pipeline: cut at 2000, then shapes, tokenize (quoted, nested, line,
// fold, bare), classify, then a token pass. No raw fallback.
// Every scan fails closed. A cap is not an emit point: past MAX_QUOTED the
// same scan runs to the end of that value. If that end is not there, the
// rest of the input is masked. Linear time.
// Key rule, JWT/auth/userinfo regexes, and the assignment scan adapted from
// chrome-cdp-ex skills/chrome-cdp-ex/scripts/lib/redaction.mjs (v2.21.0, b928082, MIT).
(function installFrontendQaMask() {
'use strict';
const TRUNCATE_AT = 2000;
const MAX_QUOTED = 4096;
const PLACEHOLDER = /^<masked len=\d+>/;
const marker = (s) => '<masked len=' + s.length + '>';
const KEY_TOKENS = new Set(['pass', 'password', 'passwords', 'passwd', 'passphrase', 'pwd',
  'secret', 'secrets', 'token', 'apikey', 'privatekey', 'accesskey', 'secretkey', 'sessionkey',
  'authkey', 'credential', 'credentials', 'otp', '2fa', 'mfa', 'auth', 'authorization', 'pin',
  'cvv', 'cvc', 'ssn', 'session', 'sessionid', 'sid', 'sessid', 'cookie', 'jwt', 'csrf', 'xsrf',
  'bearer', 'passcode', 'pincode', 'cardnumber', 'securitycode', 'signature']);
const KEY_SUFFIXES = ['token', 'secret', 'password', 'passwd', 'apikey', 'sessionid', 'sessid'];
const QTY_BEFORE = new Set(['max', 'min', 'num', 'total']);
const QTY_AFTER = new Set(['count', 'counts', 'limit', 'limits', 'length', 'size', 'usage', 'budget', 'total']);
const QUERY_TOKENS = new Set(['signature', 'sig']);
function keyTokens(key) {
  return String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])(?=[A-Z][a-z])/g, '$1 ')
    .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function tokenHit(t, prev, next, q) {
  if (t === 'token' && (QTY_BEFORE.has(prev) || QTY_AFTER.has(next))) return false;
  if (KEY_TOKENS.has(t) || (q && QUERY_TOKENS.has(t))) return true;
  return KEY_SUFFIXES.some((s) => t.length > s.length && t.endsWith(s) &&
    !(s === 'token' && QTY_BEFORE.has(t.slice(0, -s.length))));
}
function isSensitiveKey(key, q) {
  let k = String(key);
  try { k = decodeURIComponent(k); } catch (e) { /* keep raw */ }
  const t = keyTokens(k);
  if (q && t.length === 1 && t[0] === 'key') return true;
  for (let i = 0; i < t.length; i++) {
    if (tokenHit(t[i], t[i - 1], t[i + 1], q)) return true;
    if (t[i + 1] && tokenHit(t[i] + t[i + 1], t[i - 1], t[i + 2], q)) return true;
  }
  return false;
}
const JWT_RE = /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{4,}\.eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g;
const SCHEME_WORD = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/;
const AUTH_SCHEMES = new Set(['bearer', 'basic', 'token', 'digest', 'negotiate', 'ntlm', 'apikey',
  'sharedkey', 'oauth', 'hoba', 'mutual', 'hawk', 'vk']);
// Closed list. A fold line KEY: VALUE starts a new LINE only when KEY is here.
// accept-* and content-* are prefix patterns. Extending this list is a design change.
const READABLE_HEADERS = Object.freeze([
  'accept',
  'accept-*',
  'content-*',
  'user-agent',
  'host',
  'x-request-id',
  'cache-control',
  'connection',
  'origin',
  'referer',
  'date',
]);
const HEADER_KEY_RE = /^["']?([A-Za-z0-9_.%-]+)["']?[ \t]*:[ \t]/;
function isReadableHeaderName(name) {
  const n = String(name).toLowerCase();
  for (let i = 0; i < READABLE_HEADERS.length; i++) {
    const item = READABLE_HEADERS[i];
    if (item.endsWith('*')) {
      if (n.startsWith(item.slice(0, -1))) return true;
    } else if (n === item) return true;
  }
  return false;
}
function headerNameAt(text, at) {
  const m = HEADER_KEY_RE.exec(text.slice(at));
  return m ? m[1] : '';
}
function leadingWs(text, at) {
  let n = 0;
  while (text[at + n] === ' ' || text[at + n] === '\t') n++;
  return n;
}
// Column of the first non-space on the line that holds index. CRLF is one break.
function lineIndentAt(text, index) {
  let i = index;
  while (i > 0 && text[i - 1] !== '\n' && text[i - 1] !== '\r') i--;
  if (text[i] === '\n') i++;
  return leadingWs(text, i);
}
function isReadableFoldLine(text, lineStart) {
  const name = headerNameAt(text, lineStart + leadingWs(text, lineStart));
  return name !== '' && isReadableHeaderName(name);
}
const TOKEN68_RE = /[A-Za-z0-9._~+/=-]+/y;
const VENDOR_RE = /(?<![A-Za-z0-9])(?:AKIA|ASIA)[0-9A-Z]{16}(?![A-Za-z0-9])|(?<![A-Za-z0-9])(?:xox[abposr]-[A-Za-z0-9-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|[sr]k_(?:live|test)_[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_-]{30,})/g;
const USERINFO_RE = /(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/[^\s/?#@:]*:)([^\s/?#@]+)(@)/gi;
const ASSIGN_RE = /(^|[\s{[,;?&#]|(?<![=(])["'`])(\\?["'`]|)([A-Za-z0-9_.%-]+(?::[A-Za-z0-9_.%-]+)*)\2(\s*[:=]\s*)/g;
const BARE_RE = /[^"'`\s,;&}\])<>]+/y;
const CSS_PSEUDO = /^:(?:hover|focus|active|checked|disabled|enabled|visited|not|has|is|where|before|after|first-child|last-child|nth-child|root|empty|required|valid|invalid)\b/;
// A cap is not an emit point. The first window stops at MAX_QUOTED; the same
// scan then runs to the closing quote. No closer: mask through the end of the input.
function scanQuoted(text, at) {
  const q = text[at];
  const cap = at + 1 + MAX_QUOTED;
  let i = at + 1;
  while (i < text.length) {
    const limit = i < cap ? Math.min(text.length, cap) : text.length;
    for (; i < limit; i++) {
      if (text[i] === '\\') i++;
      else if (text[i] === q) return { start: at + 1, end: i, close: q };
    }
  }
  return { start: at + 1, end: text.length, close: '' };
}
function scanNested(text, at) {
  const cap = at + MAX_QUOTED;
  let depth = 0;
  let q = '';
  let i = at;
  while (i < text.length) {
    const limit = i < cap ? Math.min(text.length, cap) : text.length;
    for (; i < limit; i++) {
      const ch = text[i];
      if (q) { if (ch === '\\') i++; else if (ch === q) q = ''; continue; }
      if (ch === '"' || ch === "'" || ch === '`') q = ch;
      else if (ch === '{' || ch === '[') depth++;
      else if ((ch === '}' || ch === ']') && --depth === 0) return { start: at, end: i + 1, close: ch };
    }
  }
  return { start: at, end: text.length, close: '' };
}
function skipBws(text, i) {
  while (text[i] === ' ' || text[i] === '\t') i++;
  return i;
}
function isAuthScheme(word) {
  const name = String(word);
  if (AUTH_SCHEMES.has(name.toLowerCase())) return true;
  return name.includes('-') && SCHEME_WORD.test(name);
}
function credentialToken(token) {
  return chunkOpaque(token) || /\d/.test(token) || /[^A-Za-z0-9]/.test(token) || token.length >= 20;
}
// Non-auth scheme words still use this. Auth schemes do not: the tail is always the credential.
function tailIsCredential(tail) {
  if (/[^A-Za-z\s]/.test(tail)) return true;
  const words = tail.split(/\s+/).filter(Boolean);
  if (words.length === 1) return true;
  for (let i = 0; i < words.length; i++) {
    if (credentialToken(words[i])) return true;
  }
  return false;
}
// FOLD: a following line that starts with space or tab and is indented MORE than the
// LINE's own first column. A KEY: VALUE fold starts a new LINE only on the readable list.
function isDeeperFold(text, lineStart, parentIndent) {
  const indent = leadingWs(text, lineStart);
  if (indent <= parentIndent) return false;
  if (isReadableFoldLine(text, lineStart)) return false;
  return true;
}
// End of an unquoted value: end of line, plus deeper folds. Do not stop at ; , : / or quotes.
function valueEnd(text, at) {
  const parentIndent = lineIndentAt(text, at);
  let i = at;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') {
      let j = i + 1;
      if (ch === '\r' && text[j] === '\n') j++;
      if (j < text.length && isDeeperFold(text, j, parentIndent)) {
        i = j;
        continue;
      }
      break;
    }
    i++;
  }
  return i;
}
function lineBreakEnd(text, at) {
  let j = at + 1;
  if (text[at] === '\r' && text[j] === '\n') j++;
  return j;
}
function lineContentEnd(text, at) {
  let i = at;
  while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i++;
  return i;
}
// Unquoted assignment value. Spaces stay inside a letter phrase. Stop at end of line,
// at & ; , or at a quote or bracket. A space before a non-letter token (for example " [200]") ends it.
function unquotedValueEnd(text, at) {
  let i = at;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r' || ch === '&' || ch === ';' || ch === ',' ||
        ch === '"' || ch === "'" || ch === '`' || ch === '}' || ch === ']' ||
        ch === ')' || ch === '<' || ch === '>') break;
    if (ch === ' ' || ch === '\t') {
      let j = i;
      while (text[j] === ' ' || text[j] === '\t') j++;
      if (!/[A-Za-z]/.test(text[j] || '')) break;
      let k = j;
      while (k < text.length && /[A-Za-z]/.test(text[k])) k++;
      i = k;
      continue;
    }
    i++;
  }
  return i;
}
// Authorization prose ("header is missing") keeps the letter tail readable.
// Any other sensitive key takes the whole phrase, including a short first word such as "my".
function schemeProseStays(key, token, text, tokenEnd) {
  const name = String(key);
  if (token.length < 3) return false;
  if (!/authorization/i.test(name) && !/^auth$/i.test(name)) return false;
  const tail = text.slice(tokenEnd, unquotedValueEnd(text, tokenEnd));
  return /^[ \t]+[A-Za-z]+(?:[ \t]+[A-Za-z]+)+[ \t]*$/.test(tail);
}
// Folds after an unquoted value. parentIndent is the LINE's first column.
function extendIndentedFolds(text, end, parentIndent) {
  let j = end;
  while (text[j] === ' ' || text[j] === '\t') j++;
  if (text[j] !== '\n' && text[j] !== '\r') return end;
  let i = j;
  let consumed = false;
  while (i < text.length && (text[i] === '\n' || text[i] === '\r')) {
    const k = lineBreakEnd(text, i);
    if (k >= text.length || !isDeeperFold(text, k, parentIndent)) break;
    consumed = true;
    i = k;
    while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i++;
  }
  return consumed ? i : end;
}
// A closed quote or bracket ends the value. Indented lines after that closer are not folds.
function withFold(text, span) {
  if (span.close) return span;
  const parentIndent = lineIndentAt(text, span.start);
  const folded = extendIndentedFolds(text, span.end, parentIndent);
  if (folded > span.end) return { start: span.start, end: folded };
  return span;
}
// Lone scheme at end of line: the next line is masked (any indent) unless it is a
// readable header, or a sensitive key that is not itself a deeper fold.
function loneSchemeTail(text, breakAt) {
  const j = lineBreakEnd(text, breakAt);
  if (j >= text.length) return null;
  const parentIndent = lineIndentAt(text, breakAt);
  const indent = leadingWs(text, j);
  const content = j + indent;
  if (content >= text.length || text[content] === '\n' || text[content] === '\r') return null;
  const name = headerNameAt(text, content);
  if (name && isReadableHeaderName(name)) return null;
  if (name && isSensitiveKey(name) && indent <= parentIndent) return null;
  if (text.startsWith('<masked len=', content)) return null;
  let end = lineContentEnd(text, content);
  const folded = extendIndentedFolds(text, end, parentIndent);
  if (folded > end) end = folded;
  if (end <= content) return null;
  return { start: content, end };
}
// Auth scheme (Bearer, Basic, Token, …), keyed or keyless. Rest of the line and every
// indented fold are masked. No letter-tail exception on this path.
function authSchemeTail(text, schemeEnd) {
  let start = schemeEnd;
  if (text[start] === ' ' || text[start] === '\t') {
    start = skipBws(text, start);
    if (start === schemeEnd || text.startsWith('<masked len=', start)) return null;
  } else if (text[start] !== '\n' && text[start] !== '\r') return null;
  if (start >= text.length) return null;
  if (text[start] === '\n' || text[start] === '\r') return loneSchemeTail(text, start);
  const end = valueEnd(text, start);
  if (end <= start) return null;
  return { start, end };
}
// Non-auth scheme words only. A single credential token on the next line is the value.
// A normal next line stays readable. Auth schemes use authSchemeTail instead.
function nextLineCredential(text, breakAt) {
  const j = lineBreakEnd(text, breakAt);
  if (j >= text.length) return null;
  if (text[j] === ' ' || text[j] === '\t') {
    const end = valueEnd(text, breakAt);
    if (end <= j || !tailIsCredential(text.slice(j, end))) return null;
    return { start: j, end };
  }
  TOKEN68_RE.lastIndex = j;
  const token = TOKEN68_RE.exec(text);
  if (!token || !credentialToken(token[0]) || NUMBER.test(token[0])) return null;
  let end = j + token[0].length;
  let k = end;
  while (text[k] === ' ' || text[k] === '\t') k++;
  if (k < text.length && text[k] !== '\n' && text[k] !== '\r') return null;
  return { start: j, end };
}
function schemeCredential(text, schemeEnd) {
  let start = schemeEnd;
  if (text[start] === ' ' || text[start] === '\t') {
    start = skipBws(text, start);
    if (start === schemeEnd || text.startsWith('<masked len=', start)) return null;
  } else if (text[start] !== '\n' && text[start] !== '\r') return null;
  if (start >= text.length) return null;
  if (text[start] === '\n' || text[start] === '\r') return nextLineCredential(text, start);
  const lineEnd = lineContentEnd(text, start);
  const end = valueEnd(text, start);
  if (end <= start) return null;
  // The first line decides a short credential. A folded prose line must not excuse it.
  // The whole tail, folds included, still fails closed when the fold itself is the credential.
  const firstLine = text.slice(start, lineEnd);
  if (!tailIsCredential(firstLine) && !tailIsCredential(text.slice(start, end))) return null;
  return { start, end };
}
function keyAnchored(text, spans) {
  ASSIGN_RE.lastIndex = 0;
  let m;
  while ((m = ASSIGN_RE.exec(text)) !== null) {
    const [whole, prefix, kq, key, sep] = m;
    const vStart = m.index + whole.length;
    const eq = sep.includes('=');
    if (prefix === '#' && !eq) continue;
    if (!eq && !kq && CSS_PSEUDO.test(text.slice(vStart - sep.length + sep.indexOf(':')))) continue;
    const q = eq && !kq && (prefix === '?' || prefix === '&' || prefix === '#');
    if (!isSensitiveKey(key, q)) { ASSIGN_RE.lastIndex = m.index + whole.trimEnd().length; continue; }
    let span;
    let bare = false;
    let bareScheme = false;
    if (text[vStart] === '"' || text[vStart] === "'" || text[vStart] === '`') span = scanQuoted(text, vStart);
    else if (text[vStart] === '\\' && (text[vStart + 1] === '"' || text[vStart + 1] === "'" || text[vStart + 1] === '`')) {
      const close = '\\' + text[vStart + 1];
      const from = vStart + 2;
      const at = text.indexOf(close, from);
      // A closer past MAX_QUOTED is still the end of the value. None: the rest of the input.
      span = { start: from, end: at >= 0 ? at : text.length };
    } else if (text[vStart] === '{' || text[vStart] === '[') {
      span = scanNested(text, vStart); // object/array under a secret key: mask it whole
    } else {
      bare = true;
      BARE_RE.lastIndex = vStart;
      const b = BARE_RE.exec(text);
      if (!b) continue;
      span = { start: vStart, end: vStart + b[0].length };
      if (text.startsWith('<masked len=', span.end)) { ASSIGN_RE.lastIndex = span.end; continue; } // a shape already owns it
      // A long or digit-heavy token is the credential, not a scheme name. Hyphenated names (AWS4-HMAC-SHA256) stay schemes.
      bareScheme = SCHEME_WORD.test(b[0]) && (b[0].includes('-') || !credentialToken(b[0]));
    }
    if (span.end <= span.start) continue;
    if (PLACEHOLDER.test(text.slice(span.start, span.end + 1))) { ASSIGN_RE.lastIndex = span.end; continue; }
    const token = text.slice(span.start, span.end);
    if (/^(?:Bearer|Basic)$/i.test(token)) {
      // Same-line Bearer/Basic is masked in maskAuthSameLine. A lone scheme uses this path.
      const cred = authSchemeTail(text, span.end);
      if (!cred) continue;
      span = cred;
    } else if (bareScheme) {
      const cred = isAuthScheme(token) ? authSchemeTail(text, span.end) : schemeCredential(text, span.end);
      if (cred) {
        spans.push([span.start, span.end]);
        span = cred;
      } else if (!schemeProseStays(key, token, text, span.end)) {
        span = { start: span.start, end: unquotedValueEnd(text, span.start) };
      }
    } else if (bare) {
      const end = unquotedValueEnd(text, span.start);
      if (end > span.end) span = { start: span.start, end };
    }
    if (span.end <= span.start) continue;
    span = withFold(text, span);
    if (span.end <= span.start) continue;
    spans.push([span.start, span.end]);
    ASSIGN_RE.lastIndex = Math.max(span.end, ASSIGN_RE.lastIndex);
  }
}
const DELIM = /[\s"'`|,;!<>()[\]{}\\]|[^\x00-\x7f]/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const BUNDLE = /^[\w.-]+[-.][A-Za-z0-9_]{6,24}\.(?:js|mjs|cjs|css|map)$/;
const B64 = /^[A-Za-z0-9+/_-]{16,}={0,2}$/;
const UNIT = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g;
function partOpaque(p) {
  if (p.length < 8 || NUMBER.test(p) || UUID.test(p)) return false;
  if (/[^A-Za-z0-9]/.test(p)) return true;
  const units = p.match(UNIT) || [];
  let digitRuns = 0; let acronyms = 0; let bad = 0;
  for (const u of units) {
    if (/^\d/.test(u)) { digitRuns++; if (u.length > 4) bad++; continue; }
    if (/^[A-Z]+$/.test(u)) { acronyms++; continue; } // PHP, XML, the O in OAuth
    if (u.length < 2 || !/[aeiouy]/i.test(u)) bad++;   // one letter, or no vowel (Wxh, Nzg)
  }
  const score = bad + Math.max(0, acronyms - 1) + Math.max(0, digitRuns - 1);
  if (score >= 2 || digitRuns > 2) return true;
  return p.length >= 20 && units.length / p.length > 0.3;
}
function chunkOpaque(c) {
  if (!c) return false;
  if (/^sku[-_]/i.test(c) || UUID.test(c)) return false;
  return c.split(/[-_]+/).some(partOpaque);
}
function segmentOpaque(seg) {
  if (!seg || BUNDLE.test(seg)) return false;
  const fl = /^(.+?\.\w+)(?::\d+){1,2}$/.exec(seg); // file:line:col
  if (fl) seg = fl[1];
  if (BUNDLE.test(seg)) return false;
  return seg.split(/[@:.#?~%+=]+/).some(chunkOpaque);
}
function pathOpaque(t) {
  if (B64.test(t) && (/\+/.test(t) || /=$/.test(t))) return true; // padded or '+' base64
  return t.split('/').some(segmentOpaque);
}
function maskPairs(body, query) {
  return body.split('&').map((pair) => {
    const i = pair.indexOf('=');
    if (i < 0) return pathOpaque(pair) ? marker(pair) : pair;
    const k = pair.slice(0, i); const v = pair.slice(i + 1);
    if (!v || PLACEHOLDER.test(v)) return pair;
    return (isSensitiveKey(k, query) || pathOpaque(v)) ? k + '=' + marker(v) : pair;
  }).join('&');
}
function maskUrl(t) {
  const m = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(t);
  if (!m) return marker(t);
  const [, scheme, auth, path, query, hash] = m;
  const host = auth.replace(/^.*@/, '').replace(/:\d+$/, '');
  let out = scheme + (host.split('.').some(chunkOpaque) ? marker(auth) : auth);
  out += path.split('/').map((s) => (segmentOpaque(s) ? marker(s) : s)).join('/');
  if (query) out += '?' + maskPairs(query.slice(1), true);
  if (hash) out += '#' + (hash.includes('=') ? maskPairs(hash.slice(1), true) : (pathOpaque(hash.slice(1)) ? marker(hash.slice(1)) : hash.slice(1)));
  return out;
}
function maskToken(t) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
    const tail = /[.:?]+$/.exec(t); // sentence punctuation after a URL
    return tail ? maskUrl(t.slice(0, -tail[0].length)) + tail[0] : maskUrl(t);
  }
  if (/^[?&#]/.test(t) && t.includes('=')) return t[0] + maskPairs(t.slice(1), true);
  const eq = t.indexOf('=');
  if (eq > 0 && eq < t.length - 1 && !/^[A-Za-z0-9+/]+={1,2}$/.test(t)) return maskPairs(t, false);
  return pathOpaque(t) ? marker(t) : t;
}
function tokenPass(text) {
  let out = ''; let i = 0;
  while (i < text.length) {
    if (DELIM.test(text[i])) { out += text[i++]; continue; }
    let j = i;
    while (j < text.length && !DELIM.test(text[j])) j++;
    out += maskToken(text.slice(i, j));
    i = j;
  }
  return out;
}
function applySpans(text, spans) {
  spans.sort((a, b) => a[0] - b[0]);
  let out = ''; let last = 0;
  for (const [s, e] of spans) {
    if (s < last) continue;
    out += text.slice(last, s) + marker(text.slice(s, e));
    last = e;
  }
  return out + text.slice(last);
}
const COOKIE_LINE = /^([ \t]*(?:- )?)(cookie|set-cookie)([ \t]*:[ \t]*)([^\n]*)$/gim;
function maskCookieLine(all, lead, name, sep, body) {
  let first = true;
  const out = body.replace(/(^|;\s*)([^=;\s]+)=([^;]*)/g, (m, pre, k, v) => {
    if (!first && name.toLowerCase() === 'set-cookie') return m;
    first = false;
    return v && !PLACEHOLDER.test(v) ? pre + k + '=' + marker(v) : m;
  });
  return lead + name + sep + out;
}
// Keyless auth scheme at end of line. Keyed schemes are already in the spans from keyAnchored.
function scanKeylessSchemes(text, spans) {
  const re = /\b(Bearer|Basic|Token|Digest|Negotiate|NTLM|ApiKey|SharedKey|OAuth|HOBA|Mutual|AWS4-HMAC-SHA256)\b/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const schemeEnd = m.index + m[1].length;
    let i = schemeEnd;
    if (text[i] === ' ' || text[i] === '\t') i = skipBws(text, i);
    if (text[i] !== '\n' && text[i] !== '\r') continue;
    const tail = authSchemeTail(text, schemeEnd);
    if (!tail) continue;
    let covered = false;
    for (let n = 0; n < spans.length; n++) {
      if (spans[n][0] <= tail.start && spans[n][1] >= tail.end) { covered = true; break; }
    }
    if (covered || text.startsWith('<masked len=', tail.start)) {
      re.lastIndex = tail.end;
      continue;
    }
    spans.push([tail.start, tail.end]);
    re.lastIndex = tail.end;
  }
}
function quoteIsEscaped(text, at) {
  let n = 0;
  for (let k = at - 1; k >= 0 && text[k] === '\\'; k--) n++;
  return n % 2 === 1;
}
// Quoted value (opening " or ') whose content starts with this scheme.
// End is the closing quote, or the end of the input when that quote is missing.
function quotedSchemeEnd(text, schemeStart) {
  let i = schemeStart - 1;
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
  if (i < 0) return null;
  const q = text[i];
  if ((q !== '"' && q !== "'") || quoteIsEscaped(text, i)) return null;
  let k = i - 1;
  while (k >= 0 && (text[k] === ' ' || text[k] === '\t')) k--;
  if (k >= 0) {
    const prev = text[k];
    if (prev !== ':' && prev !== '=' && prev !== ',' && prev !== '[' && prev !== '{' && prev !== '(') return null;
  }
  const scanned = scanQuoted(text, i);
  return { end: scanned.end, closed: scanned.close !== '' };
}
function schemeAfterSensitiveKey(text, schemeStart) {
  let i = schemeStart - 1;
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
  if (i >= 0 && (text[i] === '"' || text[i] === "'" || text[i] === '`') && !quoteIsEscaped(text, i)) i--;
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
  if (i < 0 || (text[i] !== ':' && text[i] !== '=')) return false;
  i--;
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
  if (i >= 0 && (text[i] === '"' || text[i] === "'" || text[i] === '`') && !quoteIsEscaped(text, i)) i--;
  const keyEnd = i + 1;
  while (i >= 0 && /[A-Za-z0-9_.%-]/.test(text[i])) i--;
  const key = text.slice(i + 1, keyEnd);
  if (!key) return false;
  const prev = i >= 0 ? text[i] : '';
  return isSensitiveKey(key, prev === '?' || prev === '&' || prev === '#');
}
function firstSchemeTokenEnd(text, at) {
  const m = /^[A-Za-z0-9._~+/=-]*/.exec(text.slice(at));
  return at + (m ? m[0].length : 0);
}
// Bearer or Basic on the same line. A quoted value that starts with the scheme ends at
// the matching closing quote; escaped quotes count. No closer: mask through the end of
// the input. Keyless prose masks only the first token. A keyed value masks the rest,
// including an indented fold that is not a key line. A placeholder already there stays.
function maskAuthSameLine(text) {
  const re = /\b(Bearer|Basic)[ \t]+/gi;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    const schemeStart = m.index;
    const content = schemeStart + m[0].length;
    if (content >= text.length || text.startsWith('<masked len=', content)) continue;
    const quoted = quotedSchemeEnd(text, schemeStart);
    const keyed = schemeAfterSensitiveKey(text, schemeStart);
    let end;
    if (quoted && !quoted.closed) end = text.length;
    else if (!keyed) end = firstSchemeTokenEnd(text, content);
    else if (quoted) end = quoted.end;
    else end = valueEnd(text, content);
    if (quoted && quoted.closed && end > quoted.end) end = quoted.end;
    if (end <= content) continue;
    out += text.slice(last, content) + marker(text.slice(content, end));
    last = end;
    re.lastIndex = end;
  }
  return out + text.slice(last);
}
function maskBody(text) {
  let s = text.replace(COOKIE_LINE, maskCookieLine).replace(JWT_RE, (j) => marker(j)).replace(VENDOR_RE, (v) => marker(v))
    .replace(USERINFO_RE, (all, a, v, at) => a + marker(v) + at);
  s = maskAuthSameLine(s);
  const spans = [];
  keyAnchored(s, spans);
  scanKeylessSchemes(s, spans);
  s = applySpans(s, spans);
  return s.split(/(<masked len=\d+>)/).map((part, i) => (i % 2 ? part : tokenPass(part))).join('');
}
const TRUNC_SUFFIX = /…<truncated len=\d+>$/;
function maskText(text) {
  const t = String(text);
  const marked = TRUNC_SUFFIX.exec(t);
  if (marked && t.length - marked[0].length <= TRUNCATE_AT) {
    const prefix = t.slice(0, t.length - marked[0].length);
    return maskBody(prefix) + marked[0];
  }
  return t.length > TRUNCATE_AT ? maskBody(t.slice(0, TRUNCATE_AT)) + '…<truncated len=' + t.length + '>' : maskBody(t);
}
function mask(key, value) {
  const text = value == null ? '' : String(value);
  const keyText = key == null ? '' : String(key);
  if (isSensitiveKey(keyText)) return marker(text);
  return maskText(text);
}
function isDate(value) {
  return Object.prototype.toString.call(value) === '[object Date]';
}
const INVALID_DATE = 'Invalid Date';
function dateText(value) {
  if (Number.isNaN(value.getTime())) return INVALID_DATE;
  return value.toISOString();
}
function maskResult(value, key, hidden, seen) {
  const keyText = key == null ? '' : String(key);
  const hide = hidden === true || isSensitiveKey(keyText);
  if (value == null) return value;
  const tag = typeof value;
  if (tag === 'number' || tag === 'boolean') return hide ? marker(String(value)) : value;
  if (tag === 'string') return hide ? marker(value) : mask(keyText, value);
  if (tag !== 'object') return hide ? marker(String(value)) : mask(keyText, String(value));
  if (isDate(value)) {
    const iso = dateText(value);
    return hide ? marker(iso) : iso;
  }
  if (seen && seen.has(value)) return '[Circular]';
  const nextSeen = seen || new Set();
  nextSeen.add(value);
  let out;
  if (Array.isArray(value)) out = value.map((item) => maskResult(item, keyText, hide, nextSeen));
  else {
    out = new Object();
    for (const entry of Object.entries(value)) out[entry[0]] = maskResult(entry[1], entry[0], hide, nextSeen);
  }
  nextSeen.delete(value);
  return out;
}
function maskSecrets(value, key, hidden) {
  return maskResult(value, key, hidden);
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
  return maskText(original);
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
globalThis.__frontendQaMaskText = maskText;
globalThis.__frontendQaMaskBody = maskBody;
globalThis.__frontendQaIsSensitiveKey = isSensitiveKey;
globalThis.__frontendQaReadableHeaders = READABLE_HEADERS;
})();
