// maskText pipeline: cut at 2000, then shapes, tokenize, classify, emit, then a
// token pass. tokenize returns QUOTED (quote char, backtick included, escapes),
// NESTED (depth; quotes do not change depth), LINE (key, separator, value),
// FOLD, BARE, PROSE, and NEWLINE. Value ends are fixed there. classify only
// marks secret spans. emit writes them. No raw fallback.
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
  const lineEnd = lineContentEnd(text, at);
  if (at >= lineEnd) return '';
  // The name and its ':' live on this line. Slicing to the end of the input
  // copied every later line once per fold line.
  const line = text.slice(at, lineEnd);
  if (!line.includes(':')) return '';
  const m = HEADER_KEY_RE.exec(line);
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
// `(` and `>` anchor a key the same way whitespace, line start, `[`, `{`, and quotes do.
const ASSIGN_RE = /(^|[\s{[,;?&#(>]|(?<![=(])["'`])(\\?["'`]|)([A-Za-z0-9_.%-]+(?::[A-Za-z0-9_.%-]+)*)\2(\s*[:=]\s*)/g;
const BARE_RE = /[^"'`\s,;&}\])<>]+/y;
const STRUCT_RE = /["'`{}\[\]\r\n]/g;
const CSS_PSEUDO = /^:(?:hover|focus|active|checked|disabled|enabled|visited|not|has|is|where|before|after|first-child|last-child|nth-child|root|empty|required|valid|invalid)\b/;
// A cap is not an emit point. The scan runs to the closing quote. No closer:
// mask through the end of the input. Jumps between quotes and backslashes;
// the closer index is the same as a per-character walk.
function scanQuoted(text, at, limit) {
  const q = text[at];
  const endLimit = limit == null ? text.length : limit;
  let i = at + 1;
  while (i < endLimit) {
    const ch = text[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === q) return { start: at + 1, end: i, close: q };
    const qAt = text.indexOf(q, i);
    const bsAt = text.indexOf('\\', i);
    let next = endLimit;
    if (qAt >= 0 && qAt < next) next = qAt;
    if (bsAt >= 0 && bsAt < next) next = bsAt;
    if (next <= i) break;
    i = next;
  }
  return { start: at + 1, end: text.length, close: '' };
}
function scanNested(text, at, limit) {
  const endLimit = limit == null ? text.length : limit;
  const cap = at + MAX_QUOTED;
  let depth = 0;
  let maxDepth = 0;
  let q = '';
  let i = at;
  while (i < endLimit) {
    const windowEnd = i < cap ? Math.min(endLimit, cap) : endLimit;
    while (i < windowEnd) {
      const ch = text[i];
      if (q) {
        if (ch === '\\') i += 2;
        else {
          if (ch === q) q = '';
          i++;
        }
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; i++; continue; }
      if (ch === '{' || ch === '[') {
        depth++;
        if (depth > maxDepth) maxDepth = depth;
        i++;
        continue;
      }
      if ((ch === '}' || ch === ']') && --depth === 0) return { start: at, end: i + 1, close: ch, depth: maxDepth };
      i++;
    }
  }
  return { start: at, end: text.length, close: '', depth: maxDepth };
}
function skipBws(text, i, limit) {
  const endLimit = limit == null ? text.length : limit;
  while (i < endLimit && (text[i] === ' ' || text[i] === '\t')) i++;
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
// End of an unquoted scheme tail: end of line, plus deeper folds, and never past limit.
// Do not stop at ; , : / or quotes. The limit is an enclosing quote, when there is one.
function valueEnd(text, at, limit) {
  const endLimit = limit == null ? text.length : limit;
  const parentIndent = lineIndentAt(text, at);
  let i = at;
  while (i < endLimit) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') {
      let j = i + 1;
      if (ch === '\r' && text[j] === '\n') j++;
      if (j < endLimit && isDeeperFold(text, j, parentIndent)) {
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
  const lf = text.indexOf('\n', at);
  const end = lf < 0 ? text.length : lf;
  // A CR before this LF ends the line. Search that span only: indexOf('\r') with
  // no end would rescan the rest of a LF-only input once per line.
  if (end - at <= 64) {
    const cr = text.slice(at, end).indexOf('\r');
    return cr < 0 ? end : at + cr;
  }
  const cr = text.indexOf('\r', at);
  if (cr < 0 || cr > end) return end;
  return cr;
}
function lineStartAt(text, index) {
  let i = index;
  while (i > 0 && text[i - 1] !== '\n' && text[i - 1] !== '\r') i--;
  return i;
}
const NEXT_KEY = /^[A-Za-z0-9_.%-]+(?::[A-Za-z0-9_.%-]+)*[ \t]*[:=]/;
const ENCLOSING_OPEN = { '(': ')', '[': ']', '{': '}', '<': '>', "'": "'", '"': '"', '`': '`' };
// Opener recorded only when it sits directly before the key. Optional space or tab
// may sit between them. A quote that wraps the key has already closed. An opener
// anywhere else on the line is not a value boundary.
function enclosingCloser(text, keyStart, keyEnd) {
  let i = keyStart - 1;
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
  if (i < 0) return '';
  let ch = text[i];
  if ((ch === '"' || ch === "'" || ch === '`') && keyEnd != null && text[keyEnd] === ch) {
    i--;
    while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
    if (i < 0) return '';
    ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{' || ch === '<') return ENCLOSING_OPEN[ch];
    return '';
  }
  return ENCLOSING_OPEN[ch] || '';
}
function nextKeyAt(text, i, limit) {
  if (i >= limit) return false;
  return NEXT_KEY.test(text.slice(i, Math.min(limit, i + 256)));
}
function clipBeforeNextKey(text, start, end) {
  let i = start;
  while (i < end) {
    if (text[i] === ' ' || text[i] === '\t') {
      let j = i;
      while (j < end && (text[j] === ' ' || text[j] === '\t')) j++;
      if (nextKeyAt(text, j, end)) return i;
    }
    i++;
  }
  return end;
}
// One rule for a quote (" ' `) or bracket ( ( [ { < ) closer. It ends the value
// only when the next character is end of line, whitespace, `,`, `;`, or `&`.
// A closer followed by another closer does not: `(password: Qw7zx5))RtY` and
// `"password: hun""ter2x` both keep the tail.
function closerFollowedByBoundary(text, i, endLimit) {
  const n = i + 1;
  if (n >= endLimit) return true;
  const ch = text[n];
  return ch === '\n' || ch === '\r' || ch === ' ' || ch === '\t' || ch === ',' || ch === ';' || ch === '&';
}
function closingTagAt(text, i, endLimit) {
  if (i + 1 >= endLimit || text[i] !== '<' || text[i + 1] !== '/') return false;
  const slice = text.slice(i, Math.min(endLimit, i + 64));
  return /^<\/[A-Za-z][^<>]*>/.test(slice);
}
// `&` ends a value only in query or form context. Form context is a whitespace-free
// run of k=v pairs joined by `&`. Query context (key preceded by `?`, `&`, or `#`)
// also ends when the next part contains `=`.
function ampEndsValue(text, amp, query) {
  let a = amp;
  while (a > 0) {
    const ch = text[a - 1];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') break;
    a--;
  }
  let b = amp + 1;
  while (b < text.length) {
    const ch = text[b];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') break;
    b++;
  }
  let allEq = true;
  let partEq = false;
  let pairs = 0;
  for (let i = a; i < b; i++) {
    const ch = text[i];
    if (ch === '&') {
      pairs++;
      if (!partEq) allEq = false;
      partEq = false;
    } else if (ch === '=') partEq = true;
  }
  if (!partEq) allEq = false;
  if (pairs > 0 && allEq) return true;
  if (!query) return false;
  for (let i = amp + 1; i < b && text[i] !== '&'; i++) {
    if (text[i] === '=') return true;
  }
  return false;
}
// Sensitive unquoted value under a key or scheme. Ends at the first of: end of line;
// whitespace before a key:/key= token; the enclosing closer when the next char is end
// of line, whitespace, `,`, `;`, or `&`; `,`/`;` before a key token; `&` in query or
// form context; a closing tag (`</td>`) after the value has started. A closer followed
// by another closer stays inside the value. The first character is part of the value
// even when it is `&`, `)`, `,`, `;`, `<`, `>`, `]`, or `}`. Anything else is part of
// the value. Unsure: mask through end of line. Non-sensitive keys do not use this scan.
function unquotedValueEnd(text, at, limit, keyStart, keyEnd, query) {
  const endLimit = limit == null ? text.length : limit;
  const origin = keyStart == null ? at : keyStart;
  const closer = enclosingCloser(text, origin, keyEnd);
  const queryAmp = query === true;
  let i = at;
  while (i < endLimit) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') break;
    const started = i > at;
    if (ch === '&') {
      if (started && ampEndsValue(text, i, queryAmp)) break;
      i++;
      continue;
    }
    if (ch === ',' || ch === ';') {
      if (started) {
        let j = i + 1;
        while (j < endLimit && (text[j] === ' ' || text[j] === '\t')) j++;
        if (nextKeyAt(text, j, endLimit)) break;
      }
      i++;
      continue;
    }
    if (started && closer && ch === closer && closerFollowedByBoundary(text, i, endLimit)) break;
    if (started && ch === '<' && closingTagAt(text, i, endLimit)) break;
    if (ch === ' ' || ch === '\t') {
      let j = i;
      while (j < endLimit && (text[j] === ' ' || text[j] === '\t')) j++;
      if (nextKeyAt(text, j, endLimit)) break;
      i++;
      continue;
    }
    i++;
  }
  return i;
}
// Authorization prose ("header is missing") keeps the letter tail readable.
// Any other sensitive key takes the whole phrase, including a short first word such as "my".
function schemeProseStays(key, token, text, tokenEnd, limit, keyStart, keyEnd, query) {
  const name = String(key);
  if (token.length < 3) return false;
  if (!/authorization/i.test(name) && !/^auth$/i.test(name)) return false;
  const endLimit = limit == null ? text.length : limit;
  // Prose is spaces and letters only. Anything else fails before the full scan.
  for (let i = tokenEnd; i < endLimit; i++) {
    const c = text.charCodeAt(i);
    if (c === 10 || c === 13) break;
    if (c === 32 || c === 9) continue;
    if (c >= 65 && c <= 90) continue;
    if (c >= 97 && c <= 122) continue;
    return false;
  }
  const tail = text.slice(tokenEnd, unquotedValueEnd(text, tokenEnd, endLimit, keyStart, keyEnd, query));
  return /^[ \t]+[A-Za-z]+(?:[ \t]+[A-Za-z]+)+[ \t]*$/.test(tail);
}
// Folds after an unquoted value. parentIndent is the LINE's first column.
function extendIndentedFolds(text, end, parentIndent, limit) {
  const endLimit = limit == null ? text.length : limit;
  let j = end;
  while (j < endLimit && (text[j] === ' ' || text[j] === '\t')) j++;
  if (j >= endLimit || (text[j] !== '\n' && text[j] !== '\r')) return end;
  let i = j;
  let consumed = false;
  while (i < endLimit && (text[i] === '\n' || text[i] === '\r')) {
    const k = lineBreakEnd(text, i);
    if (k >= text.length || k >= endLimit || !isDeeperFold(text, k, parentIndent)) break;
    consumed = true;
    i = k;
    const lineEnd = lineContentEnd(text, i);
    i = lineEnd > endLimit ? endLimit : lineEnd;
  }
  return consumed ? i : end;
}
// A closed quote or bracket ends the value. Indented lines after that closer are not folds.
function withFold(text, span, limit) {
  if (span.close) return span;
  const parentIndent = lineIndentAt(text, span.start);
  const folded = extendIndentedFolds(text, span.end, parentIndent, limit);
  if (folded > span.end) return { start: span.start, end: folded };
  return span;
}
// Lone scheme at end of line: the next line is masked (any indent) unless it is a
// readable header, or a sensitive key that is not itself a deeper fold.
function loneSchemeTail(text, breakAt, limit) {
  const endLimit = limit == null ? text.length : limit;
  const j = lineBreakEnd(text, breakAt);
  if (j >= text.length || j >= endLimit) return null;
  const parentIndent = lineIndentAt(text, breakAt);
  const indent = leadingWs(text, j);
  const content = j + indent;
  if (content >= text.length || content >= endLimit || text[content] === '\n' || text[content] === '\r') return null;
  const name = headerNameAt(text, content);
  if (name && isReadableHeaderName(name)) return null;
  if (name && isSensitiveKey(name) && indent <= parentIndent) return null;
  if (text.startsWith('<masked len=', content)) return null;
  let end = lineContentEnd(text, content);
  if (end > endLimit) end = endLimit;
  const folded = extendIndentedFolds(text, end, parentIndent, endLimit);
  if (folded > end) end = folded;
  if (end <= content) return null;
  return { start: content, end };
}
// Auth scheme (Bearer, Basic, Token, …), keyed or keyless. Rest of the line and every
// indented fold are masked. No letter-tail exception on this path.
// Auth scheme tail. Same line end as valueEnd, plus the enclosing closer. A comma
// before another key does not end it: Digest and AWS4 tails stay one span.
function schemeValueEnd(text, at, limit, keyStart, keyEnd) {
  const endLimit = limit == null ? text.length : limit;
  const closer = enclosingCloser(text, keyStart == null ? at : keyStart, keyEnd);
  const parentIndent = lineIndentAt(text, at);
  let i = at;
  while (i < endLimit) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') {
      let j = i + 1;
      if (ch === '\r' && text[j] === '\n') j++;
      if (j < endLimit && isDeeperFold(text, j, parentIndent)) {
        i = j;
        continue;
      }
      break;
    }
    if (closer && ch === closer && closerFollowedByBoundary(text, i, endLimit)) break;
    i++;
  }
  return i;
}
function authSchemeTail(text, schemeEnd, limit, keyStart, keyEnd) {
  const endLimit = limit == null ? text.length : limit;
  let start = schemeEnd;
  if (start >= endLimit) return null;
  if (text[start] === ' ' || text[start] === '\t') {
    start = skipBws(text, start, endLimit);
    if (start === schemeEnd || text.startsWith('<masked len=', start)) return null;
  } else if (text[start] !== '\n' && text[start] !== '\r') return null;
  if (start >= endLimit) return null;
  if (text[start] === '\n' || text[start] === '\r') return loneSchemeTail(text, start, endLimit);
  const end = schemeValueEnd(text, start, endLimit, keyStart, keyEnd);
  if (end <= start) return null;
  return { start, end };
}
// Non-auth scheme words only. A single credential token on the next line is the value.
// A normal next line stays readable. Auth schemes use authSchemeTail instead.
function nextLineCredential(text, breakAt, limit) {
  const endLimit = limit == null ? text.length : limit;
  const j = lineBreakEnd(text, breakAt);
  if (j >= text.length || j >= endLimit) return null;
  if (text[j] === ' ' || text[j] === '\t') {
    const end = valueEnd(text, breakAt, endLimit);
    if (end <= j || !tailIsCredential(text.slice(j, end))) return null;
    return { start: j, end };
  }
  TOKEN68_RE.lastIndex = j;
  const token = TOKEN68_RE.exec(text);
  if (!token || token.index !== j || !credentialToken(token[0]) || NUMBER.test(token[0])) return null;
  let end = j + token[0].length;
  if (end > endLimit) return null;
  let k = end;
  while (k < endLimit && (text[k] === ' ' || text[k] === '\t')) k++;
  if (k < endLimit && text[k] !== '\n' && text[k] !== '\r') return null;
  return { start: j, end };
}
function schemeCredential(text, schemeEnd, limit) {
  const endLimit = limit == null ? text.length : limit;
  let start = schemeEnd;
  if (start >= endLimit) return null;
  if (text[start] === ' ' || text[start] === '\t') {
    start = skipBws(text, start, endLimit);
    if (start === schemeEnd || text.startsWith('<masked len=', start)) return null;
  } else if (text[start] !== '\n' && text[start] !== '\r') return null;
  if (start >= endLimit) return null;
  if (text[start] === '\n' || text[start] === '\r') return nextLineCredential(text, start, endLimit);
  if (nextKeyAt(text, start, endLimit)) return null;
  const lineEnd = lineContentEnd(text, start);
  const end = clipBeforeNextKey(text, start, valueEnd(text, start, endLimit));
  if (end <= start) return null;
  // The first line decides a short credential. A folded prose line must not excuse it.
  // The whole tail, folds included, still fails closed when the fold itself is the credential.
  const firstLine = text.slice(start, Math.min(lineEnd, endLimit));
  if (!tailIsCredential(firstLine) && !tailIsCredential(text.slice(start, end))) return null;
  return { start, end };
}
function readBare(text, at, limit) {
  BARE_RE.lastIndex = at;
  const found = BARE_RE.exec(text);
  if (!found || found.index !== at) return '';
  const end = Math.min(at + found[0].length, limit);
  return text.slice(at, end);
}
function hasEscapes(text, from, to) {
  const at = text.indexOf('\\', from);
  return at >= 0 && at < to;
}
// Rightmost quote that starts before pos wins. Quotes do not nest.
// A quote that closes at or before sepEnd only wraps the key. It is not a value boundary.
function enclosingContentEnd(quotes, pos, sepEnd) {
  let lo = 0;
  let hi = quotes.length - 1;
  let ans = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (quotes[mid].start < pos) { ans = quotes[mid]; lo = mid + 1; }
    else hi = mid - 1;
  }
  if (!ans || pos < ans.contentStart || pos >= ans.contentEnd) return null;
  if (sepEnd != null && ans.contentEnd <= sepEnd) return null;
  return ans.contentEnd;
}
// A quote limits a sensitive value only when it is the enclosing opener directly
// before the key. A prose apostrophe or quote earlier on the line does not.
function valueLimit(text, quotes, keyStart, keyEnd, sepEnd) {
  let lo = 0;
  let hi = quotes.length - 1;
  let ans = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (quotes[mid].start < keyStart) { ans = quotes[mid]; lo = mid + 1; }
    else hi = mid - 1;
  }
  if (!ans || keyStart < ans.contentStart || keyStart >= ans.contentEnd) return null;
  if (sepEnd != null && ans.contentEnd <= sepEnd) return null;
  let i = keyStart - 1;
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
  if (i !== ans.start) return null;
  if (keyEnd != null && text[keyEnd] === ans.quote) return null;
  // A closer that is not followed by a boundary is still inside the value.
  if (ans.closed && !closerFollowedByBoundary(text, ans.contentEnd, text.length)) return null;
  return ans.contentEnd;
}
function markFolds(text, anchor, spanStart, spanEnd, tokens) {
  if (spanEnd <= spanStart) return;
  const parentIndent = lineIndentAt(text, anchor);
  let i = lineStartAt(text, spanStart);
  while (i < spanEnd && i < text.length) {
    if (isDeeperFold(text, i, parentIndent)) {
      const lineEnd = lineContentEnd(text, i);
      tokens.push({ type: 'FOLD', start: i, end: lineEnd, indent: leadingWs(text, i) });
    }
    const j = lineContentEnd(text, i);
    if (j >= text.length) break;
    const next = lineBreakEnd(text, j);
    if (next <= i) break;
    i = next;
  }
}
function nextStruct(text, i, n) {
  if (i >= n) return n;
  STRUCT_RE.lastIndex = i;
  const m = STRUCT_RE.exec(text);
  if (!m || m.index >= n) return n;
  return m.index;
}
function scanStructure(text, tokens, quotes) {
  const n = text.length;
  let i = 0;
  const brackets = [];
  let maxDepth = 0;
  while (i < n) {
    const ch = text[i];
    if ((ch === '"' || ch === "'" || ch === '`') && !quoteIsEscaped(text, i)) {
      const scanned = scanQuoted(text, i);
      const closed = scanned.close !== '';
      const token = {
        type: 'QUOTED',
        quote: ch,
        start: i,
        end: closed ? scanned.end + 1 : n,
        contentStart: scanned.start,
        contentEnd: closed ? scanned.end : n,
        closed,
        escapes: hasEscapes(text, scanned.start, closed ? scanned.end : n),
      };
      if (token.end <= i) token.end = i + 1;
      quotes.push(token);
      tokens.push(token);
      i = token.end;
      continue;
    }
    if (ch === '{' || ch === '[') {
      const depth = brackets.length + 1;
      if (depth > maxDepth) maxDepth = depth;
      brackets.push({ start: i, depth });
      i++;
      continue;
    }
    if ((ch === '}' || ch === ']') && brackets.length) {
      const open = brackets.pop();
      tokens.push({ type: 'NESTED', start: open.start, end: i + 1, depth: open.depth, closed: true, open: text[open.start] });
      i++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      const j = lineBreakEnd(text, i);
      tokens.push({ type: 'NEWLINE', start: i, end: j });
      i = j;
      continue;
    }
    // Letters and other non-structure characters do not change tokens.
    i = nextStruct(text, i + 1, n);
  }
  if (brackets.length) {
    tokens.push({
      type: 'NESTED',
      start: brackets[0].start,
      end: n,
      depth: maxDepth,
      closed: false,
      open: text[brackets[0].start],
    });
  }
}
function blankLine(key, keyStart, keyEnd, sepStart, sepEnd, query) {
  return {
    type: 'LINE',
    start: keyStart,
    end: sepEnd,
    key,
    keyStart,
    keyEnd,
    sepStart,
    sepEnd,
    valueStart: sepEnd,
    valueEnd: sepEnd,
    query,
    valueKind: 'empty',
    closed: false,
    placeholder: false,
    skip: false,
    exactBearer: false,
    bareScheme: false,
    prose: false,
    cred: false,
    wordStart: -1,
    wordEnd: -1,
    wordMaskStart: -1,
    wordMaskEnd: -1,
    credStart: -1,
    credEnd: -1,
  };
}
function scanLines(text, tokens, quotes) {
  const quoteAt = new Map();
  for (let q = 0; q < quotes.length; q++) quoteAt.set(quotes[q].start, quotes[q]);
  ASSIGN_RE.lastIndex = 0;
  let m;
  while ((m = ASSIGN_RE.exec(text)) !== null) {
    const whole = m[0];
    const prefix = m[1];
    const kq = m[2];
    const key = m[3];
    const sep = m[4];
    const vStart = m.index + whole.length;
    const eq = sep.includes('=');
    if (prefix === '#' && !eq) continue;
    if (!eq && !kq && CSS_PSEUDO.test(text.slice(vStart - sep.length + sep.indexOf(':')))) continue;
    const query = eq && !kq && (prefix === '?' || prefix === '&' || prefix === '#');
    const keyStart = m.index + prefix.length + kq.length;
    const keyEnd = keyStart + key.length;
    const sepStart = keyEnd + kq.length;
    const line = blankLine(key, keyStart, keyEnd, sepStart, vStart, query);
    const sensitive = isSensitiveKey(key, query);
    if (!sensitive) {
      tokens.push(line);
      ASSIGN_RE.lastIndex = m.index + whole.trimEnd().length;
      continue;
    }
    const limit = valueLimit(text, quotes, keyStart, keyEnd, vStart);
    const endLimit = limit == null ? text.length : limit;
    if (vStart >= text.length || vStart >= endLimit) {
      tokens.push(line);
      continue;
    }
    let consume = vStart;
    // An empty "" '' or `` at a boundary is the whole value. The quotes stay,
    // and nothing after them is masked. A pair glued to more text
    // (`password: ""hunter2`) is not empty and stays on the unquoted path.
    if (emptyQuoteIsWholeValue(text, vStart, endLimit, keyStart, keyEnd)) {
      line.end = vStart + 2;
      tokens.push(line);
      ASSIGN_RE.lastIndex = vStart + 2;
      continue;
    }
    if ((text[vStart] === '"' || text[vStart] === "'" || text[vStart] === '`') && !isEmptyQuotePair(text, vStart, endLimit)) {
      const existing = quoteAt.get(vStart);
      let contentStart;
      let contentEnd;
      let close;
      if (existing) {
        contentStart = existing.contentStart;
        contentEnd = existing.closed ? existing.contentEnd : text.length;
        close = existing.closed ? existing.quote : '';
      } else {
        const scanned = scanQuoted(text, vStart, endLimit);
        contentStart = scanned.start;
        contentEnd = scanned.close ? scanned.end : text.length;
        close = scanned.close;
      }
      line.valueKind = 'quoted';
      line.valueStart = contentStart;
      line.valueEnd = contentEnd;
      line.closed = close !== '';
      line.end = line.closed ? contentEnd + 1 : contentEnd;
      line.placeholder = PLACEHOLDER.test(text.slice(contentStart, contentEnd + 1));
      consume = contentEnd;
    } else if (text[vStart] === '\\' && (text[vStart + 1] === '"' || text[vStart + 1] === "'" || text[vStart + 1] === '`')) {
      const closer = '\\' + text[vStart + 1];
      const from = vStart + 2;
      const at = text.indexOf(closer, from);
      const end = at >= 0 && at < endLimit ? at : text.length;
      const folded = withFold(text, { start: from, end }, endLimit);
      line.valueKind = 'escaped';
      line.valueStart = from;
      line.valueEnd = folded.end;
      line.closed = false;
      line.end = folded.end;
      line.placeholder = PLACEHOLDER.test(text.slice(from, folded.end + 1));
      consume = folded.end;
      markFolds(text, from, from, folded.end, tokens);
    } else if (text[vStart] === '{' || text[vStart] === '[') {
      const nested = scanNested(text, vStart, endLimit);
      const folded = withFold(text, nested, endLimit);
      line.valueKind = 'nested';
      line.valueStart = nested.start;
      line.valueEnd = folded.end;
      line.closed = nested.close !== '';
      line.depth = nested.depth;
      line.end = folded.end;
      line.placeholder = PLACEHOLDER.test(text.slice(nested.start, folded.end + 1));
      consume = folded.end;
      if (!nested.close) markFolds(text, nested.start, nested.start, folded.end, tokens);
    } else {
      if (PLACEHOLDER.test(text.slice(vStart, endLimit))) {
        const ph = /^<masked len=\d+>/.exec(text.slice(vStart, endLimit));
        line.placeholder = true;
        line.valueKind = 'bare';
        line.valueStart = vStart;
        line.valueEnd = vStart + ph[0].length;
        line.end = line.valueEnd;
        tokens.push(line);
        ASSIGN_RE.lastIndex = line.end;
        continue;
      }
      const word = readBare(text, vStart, endLimit);
      if (!word) {
        const full = withFold(text, { start: vStart, end: unquotedValueEnd(text, vStart, endLimit, keyStart, keyEnd, query) }, endLimit);
        if (full.end <= vStart) {
          tokens.push(line);
          continue;
        }
        line.valueKind = 'bare';
        line.valueStart = vStart;
        line.valueEnd = full.end;
        line.end = full.end;
        markFolds(text, vStart, vStart, full.end, tokens);
        tokens.push(line);
        if (full.end > m.index) ASSIGN_RE.lastIndex = Math.max(ASSIGN_RE.lastIndex, full.end);
        continue;
      }
      const wordEnd = vStart + word.length;
      if (text.startsWith('<masked len=', wordEnd)) {
        // The shape pass already wrote this placeholder. Masking across it splits
        // the marker. The pair name stays readable, digits included.
        line.skip = true;
        line.valueKind = 'bare';
        line.wordStart = vStart;
        line.wordEnd = wordEnd;
        line.valueStart = vStart;
        line.valueEnd = wordEnd;
        line.end = wordEnd;
        tokens.push(line);
        ASSIGN_RE.lastIndex = wordEnd;
        continue;
      }
      const bareScheme = SCHEME_WORD.test(word) && (word.includes('-') || !credentialToken(word));
      const exactBearer = /^(?:Bearer|Basic)$/i.test(word);
      line.valueKind = 'bare';
      line.wordStart = vStart;
      line.wordEnd = wordEnd;
      line.valueStart = vStart;
      line.exactBearer = exactBearer;
      line.bareScheme = bareScheme;
      line.prose = !exactBearer && bareScheme && schemeProseStays(key, word, text, wordEnd, endLimit, keyStart, keyEnd, query);
      const wordFold = withFold(text, { start: vStart, end: wordEnd }, endLimit);
      line.wordMaskStart = wordFold.start;
      line.wordMaskEnd = wordFold.end;
      let cred = null;
      if (exactBearer || (bareScheme && isAuthScheme(word))) cred = authSchemeTail(text, wordEnd, endLimit, keyStart, keyEnd);
      else if (bareScheme) cred = schemeCredential(text, wordEnd, endLimit);
      if (cred) {
        const folded = withFold(text, { start: cred.start, end: cred.end }, endLimit);
        line.cred = true;
        line.credStart = folded.start;
        line.credEnd = folded.end;
        markFolds(text, wordEnd, folded.start, folded.end, tokens);
      }
      const full = withFold(text, { start: vStart, end: unquotedValueEnd(text, vStart, endLimit, keyStart, keyEnd, query) }, endLimit);
      line.valueEnd = full.end;
      line.end = full.end;
      if (!line.cred) markFolds(text, vStart, vStart, full.end, tokens);
      if (PLACEHOLDER.test(text.slice(vStart, wordEnd + 1))) line.placeholder = true;
      if (exactBearer) consume = line.cred ? line.credEnd : vStart;
      else if (bareScheme && line.cred) consume = line.credEnd;
      else if (bareScheme && line.prose) consume = line.wordMaskEnd;
      else consume = line.valueEnd;
    }
    tokens.push(line);
    if (consume > m.index) ASSIGN_RE.lastIndex = Math.max(ASSIGN_RE.lastIndex, consume);
  }
}
function isWordChar(ch) {
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') ||
    ch === '.' || ch === '_' || ch === '~' || ch === '+' || ch === '/' || ch === '=' || ch === '-';
}
function scanWords(text, tokens) {
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') { i = lineBreakEnd(text, i); continue; }
    if (isWordChar(ch)) {
      const start = i;
      i++;
      while (i < n && isWordChar(text[i])) i++;
      tokens.push({ type: 'BARE', start, end: i });
      continue;
    }
    const start = i;
    i++;
    while (i < n && text[i] !== '\n' && text[i] !== '\r' && !isWordChar(text[i])) i++;
    tokens.push({ type: 'PROSE', start, end: i });
  }
}
const KEYLESS_RE = /\b(Bearer|Basic|Token|Digest|Negotiate|NTLM|ApiKey|SharedKey|OAuth|HOBA|Mutual|AWS4-HMAC-SHA256)\b/gi;
function keylessTail(text, schemeEnd, word, endLimit) {
  const bearer = /^(?:bearer|basic)$/i.test(word);
  if (schemeEnd < endLimit && (text[schemeEnd] === ' ' || text[schemeEnd] === '\t')) {
    const after = skipBws(text, schemeEnd, endLimit);
    if (after < endLimit && (text[after] === '\n' || text[after] === '\r')) return loneSchemeTail(text, after, endLimit);
    if (!bearer || after >= endLimit || after === schemeEnd) return null;
    if (text.startsWith('<masked len=', after)) return null;
    const matched = /^[A-Za-z0-9._~+/=-]*/.exec(text.slice(after, endLimit));
    const len = matched && matched[0] ? matched[0].length : 0;
    if (!len) return null;
    return { start: after, end: after + len };
  }
  if (schemeEnd < endLimit && (text[schemeEnd] === '\n' || text[schemeEnd] === '\r')) {
    return loneSchemeTail(text, schemeEnd, endLimit);
  }
  return null;
}
function scanKeylessTokens(text, tokens, quotes) {
  KEYLESS_RE.lastIndex = 0;
  let m;
  while ((m = KEYLESS_RE.exec(text)) !== null) {
    const word = m[1];
    const schemeEnd = m.index + word.length;
    const limit = enclosingContentEnd(quotes, m.index);
    const tail = keylessTail(text, schemeEnd, word, limit == null ? text.length : limit);
    tokens.push({
      type: 'BARE',
      start: m.index,
      end: schemeEnd,
      keyless: !!tail,
      keylessStart: tail ? tail.start : -1,
      keylessEnd: tail ? tail.end : -1,
    });
    if (tail && tail.end > schemeEnd) KEYLESS_RE.lastIndex = tail.end;
  }
}
function tokenize(text) {
  const tokens = [];
  const quotes = [];
  scanStructure(text, tokens, quotes);
  scanLines(text, tokens, quotes);
  scanWords(text, tokens);
  scanKeylessTokens(text, tokens, quotes);
  return tokens;
}
function classify(tokens) {
  const spans = [];
  for (let i = 0; i < tokens.length; i++) {
    const line = tokens[i];
    if (line.type !== 'LINE') continue;
    if (line.skip || line.placeholder) continue;
    if (!isSensitiveKey(line.key, line.query)) continue;
    if (line.valueKind === 'quoted' || line.valueKind === 'nested' || line.valueKind === 'escaped') {
      if (line.valueEnd > line.valueStart) spans.push([line.valueStart, line.valueEnd]);
      continue;
    }
    if (line.valueKind !== 'bare') continue;
    if (line.exactBearer) {
      if (line.cred && line.credEnd > line.credStart) spans.push([line.credStart, line.credEnd]);
      continue;
    }
    if (line.bareScheme && line.cred) {
      if (line.wordEnd > line.wordStart) spans.push([line.wordStart, line.wordEnd]);
      if (line.credEnd > line.credStart) spans.push([line.credStart, line.credEnd]);
      continue;
    }
    if (line.bareScheme && line.prose) {
      if (line.wordMaskEnd > line.wordMaskStart) spans.push([line.wordMaskStart, line.wordMaskEnd]);
      continue;
    }
    if (line.valueEnd > line.valueStart) spans.push([line.valueStart, line.valueEnd]);
  }
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type !== 'BARE' || !tok.keyless) continue;
    if (tok.keylessEnd > tok.keylessStart) spans.push([tok.keylessStart, tok.keylessEnd]);
  }
  return spans;
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
const ASSIGNMENT_KEY = /^[A-Za-z][A-Za-z0-9_.%-]*(?::[A-Za-z0-9_.%-]+)*=$/;
// keepAssignment: this slice ends immediately before an existing placeholder.
// A bare key= there is the key name, not a padded secret. Leave it.
function tokenPass(text, keepAssignment) {
  let out = ''; let i = 0;
  while (i < text.length) {
    if (DELIM.test(text[i])) { out += text[i++]; continue; }
    let j = i;
    while (j < text.length && !DELIM.test(text[j])) j++;
    const tok = text.slice(i, j);
    if (keepAssignment && j === text.length && ASSIGNMENT_KEY.test(tok)) out += tok;
    else out += maskToken(tok);
    i = j;
  }
  return out;
}
function emit(text, spans) {
  const ranges = spans.map((span) => (Array.isArray(span) ? [span[0], span[1]] : [span.start, span.end]));
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let out = '';
  let last = 0;
  for (let i = 0; i < ranges.length; i++) {
    const s = ranges[i][0];
    const e = ranges[i][1];
    if (e <= s || s < last) continue;
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
// "" '' or `` at the start of a value is text, not a wrapper. The next character
// has to be the same quote and still inside the scan window.
function isEmptyQuotePair(text, at, limit) {
  const q = text[at];
  if ((q !== '"' && q !== "'" && q !== '`') || quoteIsEscaped(text, at)) return false;
  const n = at + 1;
  const end = limit == null ? text.length : limit;
  return n < end && text[n] === q && !quoteIsEscaped(text, n);
}
// The pair is the whole value when the character after it is end of line,
// whitespace, `,`, `;`, `&`, or the enclosing closer. `""hunter2` is glued.
function emptyQuoteIsWholeValue(text, at, limit, keyStart, keyEnd) {
  if (!isEmptyQuotePair(text, at, limit)) return false;
  const end = limit == null ? text.length : limit;
  if (closerFollowedByBoundary(text, at + 1, end)) return true;
  const next = at + 2;
  if (next >= end) return false;
  const closer = enclosingCloser(text, keyStart, keyEnd);
  return closer !== '' && text[next] === closer;
}
function quoteIsEscaped(text, at) {
  let n = 0;
  for (let k = at - 1; k >= 0 && text[k] === '\\'; k--) n++;
  return n % 2 === 1;
}
function maskBody(text) {
  let shaped = text;
  // Skip a shape scan only when its pattern cannot match. The scan itself is unchanged.
  shaped = shaped.replace(COOKIE_LINE, maskCookieLine);
  if (text.includes('eyJ')) shaped = shaped.replace(JWT_RE, (j) => marker(j));
  if (text.includes('AKIA') || text.includes('ASIA') || text.includes('xox') || text.includes('gh') ||
      text.includes('AIza') || text.includes('sk_') || text.includes('rk_')) {
    shaped = shaped.replace(VENDOR_RE, (v) => marker(v));
  }
  if (text.includes('://')) shaped = shaped.replace(USERINFO_RE, (all, a, v, at) => a + marker(v) + at);
  const masked = emit(shaped, classify(tokenize(shaped)));
  const parts = masked.split(/(<masked len=\d+>)/);
  let out = '';
  for (let i = 0; i < parts.length; i++) out += i % 2 ? parts[i] : tokenPass(parts[i], i + 1 < parts.length);
  return out;
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
globalThis.__frontendQaTokenize = tokenize;
globalThis.__frontendQaClassify = classify;
globalThis.__frontendQaEmit = emit;
})();
