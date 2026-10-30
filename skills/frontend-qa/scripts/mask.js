// maskText pipeline: cut at 2000, then JSON, cookie, query/form, and
// key-anchored values. A sensitive value runs to end of line plus deeper
// folds, except parsed JSON leaves, a real query/form value, and
// Cookie/Set-Cookie. A space or tab after a query/form value is not a
// bound when another word continues on that line; the value then runs to
// end of line. A space before non-word text, such as " [200]", still ends it.
// Inside a parsed JSON string under a non-sensitive key, key: value and
// key=value are masked on the decoded text, bounded by the closing quote.
// Scheme words keep the c908bc0 marker shape. Then JWT, vendor, userinfo,
// and the token pass. No raw fallback. Linear time.
// Key rule, JWT/auth/userinfo regexes, and the token pass adapted from
// chrome-cdp-ex skills/chrome-cdp-ex/scripts/lib/redaction.mjs (v2.21.0, b928082, MIT).
(function installFrontendQaMask() {
'use strict';
const TRUNCATE_AT = 2000;
const PLACEHOLDER = /^<masked len=\d+>/;
const MARKER_EXACT = /^<masked len=[1-9][0-9]*>$/;
const PASS_LONE = /^<masked len=[1-9][0-9]*>$/;
const PASS_PAIR = /^<masked len=[1-9][0-9]*> <masked len=[1-9][0-9]*>$/;
const PASS_SCHEME = /^([A-Za-z]+) <masked len=[1-9][0-9]*>$/;
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
const SCHEME_NAMES = new Set(['bearer', 'basic', 'token', 'digest', 'negotiate', 'ntlm', 'apikey',
  'sharedkey', 'oauth', 'hoba', 'mutual', 'hawk', 'vk']);
const KEYLESS_NAMES = new Set(['bearer', 'basic', 'token', 'digest', 'negotiate', 'ntlm', 'apikey',
  'sharedkey', 'oauth', 'hoba', 'mutual', 'hawk', 'vk']);
// Closed list. A fold line KEY: VALUE starts a new line only when KEY is here.
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
const COOKIE_ATTRS = new Set(['path', 'domain', 'expires', 'max-age', 'secure', 'httponly', 'samesite', 'partitioned']);
const TOKEN68_RE = /[A-Za-z0-9._~+/=-]+/y;
const VENDOR_RE = /(?<![A-Za-z0-9])(?:AKIA|ASIA)[0-9A-Z]{16}(?![A-Za-z0-9])|(?<![A-Za-z0-9])(?:xox[abposr]-[A-Za-z0-9-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|[sr]k_(?:live|test)_[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_-]{30,})/g;
const USERINFO_RE = /(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/[^\s/?#@:]*:)([^\s/?#@]+)(@)/gi;
function schemeChar(c) {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '+' || c === '.' || c === '-';
}
function urlStop(c) {
  return c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\v'
    || c === '"' || c === "'" || c === '`' || c === '<' || c === '>' || c === '(' || c === ')'
    || c === '[' || c === ']' || c === '{' || c === '}' || c === ',' || c === ';' || c === '!'
    || c === '|' || c === '\\';
}
function queryUrlRanges(text) {
  const ranges = [];
  let from = 0;
  while (from < text.length) {
    const i = text.indexOf('://', from);
    if (i < 0) break;
    let s = i - 1;
    while (s >= 0 && schemeChar(text[s])) s--;
    s++;
    const head = text[s];
    if (s < i && ((head >= 'A' && head <= 'Z') || (head >= 'a' && head <= 'z'))) {
      let e = i + 3;
      let sawQuery = false;
      while (e < text.length && !urlStop(text[e])) {
        if (text[e] === '?') sawQuery = true;
        e++;
      }
      if (sawQuery && (text[e] === ' ' || text[e] === '\t')) {
        const tail = text.slice(s, e);
        const word = /[=:][ \t]*([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)$/.exec(tail);
        if (word && isKeyedSchemeWord(word[1])) {
          let k = e;
          while (text[k] === ' ' || text[k] === '\t') k++;
          while (k < text.length && !urlStop(text[k]) && text[k] !== '&' && text[k] !== '#') k++;
          e = k;
        }
      }
      if (sawQuery) ranges.push([s, e]);
      from = e > i + 3 ? e : i + 3;
    } else from = i + 3;
  }
  return ranges;
}
const COOKIE_RE = /^([ \t]*(?:[-*][ \t])?)(cookie|set-cookie)([ \t]*:[ \t]*)(.*)$/i;
const TRUNC_RE = /^…<truncated len=\d+>/;
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
function isKeyedSchemeWord(word) {
  if (!SCHEME_WORD.test(word)) return false;
  if (SCHEME_NAMES.has(word.toLowerCase())) return true;
  return word.includes('-');
}
function isKeylessScheme(word) {
  const n = word.toLowerCase();
  if (KEYLESS_NAMES.has(n)) return true;
  if (/^scram-/i.test(word) && SCHEME_WORD.test(word)) return true;
  if (/^aws4-/i.test(word) && SCHEME_WORD.test(word)) return true;
  return false;
}
function isPassShape(value) {
  if (PASS_LONE.test(value) || PASS_PAIR.test(value)) return true;
  const scheme = PASS_SCHEME.exec(value);
  if (!scheme) return false;
  const word = scheme[1].toLowerCase();
  return word === 'bearer' || word === 'basic';
}
function readMarkerAt(text, i) {
  if (!text.startsWith('<masked len=', i)) return '';
  const m = /^<masked len=[1-9][0-9]*>/.exec(text.slice(i));
  return m ? m[0] : '';
}
function lineBreakEnd(text, at) {
  let j = at + 1;
  if (text[at] === '\r' && text[j] === '\n') j++;
  return j;
}
function eol(text, at) {
  let i = at;
  while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i++;
  return i;
}
function leadingWs(text, at) {
  let n = 0;
  while (text[at + n] === ' ' || text[at + n] === '\t') n++;
  return n;
}
function lineStartAt(text, index) {
  let i = index;
  while (i > 0 && text[i - 1] !== '\n' && text[i - 1] !== '\r') i--;
  return i;
}
function lineIndentAt(text, index) {
  return leadingWs(text, lineStartAt(text, index));
}
function headerNameAt(text, at) {
  const lineEnd = eol(text, at);
  const m = /^["']?([A-Za-z0-9_.%-]+)["']?[ \t]*:[ \t]/.exec(text.slice(at, lineEnd));
  return m ? m[1] : '';
}
function isMarkerLine(text, lineStart) {
  const content = lineStart + leadingWs(text, lineStart);
  const mk = readMarkerAt(text, content);
  return mk !== '' && eol(text, content) === content + mk.length;
}
function isDeeperFold(text, lineStart, parentIndent) {
  const indent = leadingWs(text, lineStart);
  if (indent <= parentIndent) return false;
  if (isMarkerLine(text, lineStart)) return false;
  const name = headerNameAt(text, lineStart + indent);
  if (name && isReadableHeaderName(name)) return false;
  return true;
}
// End index after this line plus folds indented deeper than parentIndent.
function extendFolds(text, lineEnd, parentIndent) {
  let i = lineEnd;
  while (i < text.length && (text[i] === '\n' || text[i] === '\r')) {
    const j = lineBreakEnd(text, i);
    if (j >= text.length || !isDeeperFold(text, j, parentIndent)) break;
    i = eol(text, j);
  }
  return i;
}
function jsonUnescape(raw) {
  try { return JSON.parse('"' + raw + '"'); } catch (e) { return raw; }
}
function looksLikeJson(slice) {
  let i = 1;
  while (i < slice.length && (slice[i] === ' ' || slice[i] === '\t' || slice[i] === '\n' || slice[i] === '\r')) i++;
  if (i >= slice.length) return false;
  const c = slice[i];
  if (c === ']' || c === '}') return true;
  if (c === '"' || c === '{' || c === '[' || c === 't' || c === 'f' || c === 'n' || c === '-' || c === '<') return true;
  return c >= '0' && c <= '9';
}
function jsonOk(slice) {
  if (!looksLikeJson(slice)) return false;
  try { JSON.parse(slice); return true; } catch (e) { /* skeleton below */ }
  if (!slice.includes('<masked len=')) return false;
  const sk = slice.replace(/<masked len=[1-9][0-9]*>/g, '0');
  try { JSON.parse(sk); return true; } catch (e) { return false; }
}
function balancedSpans(text) {
  const spans = [];
  const stack = [];
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '\\') { i++; continue; }
      if (ch === '"') q = false;
      continue;
    }
    const mk = readMarkerAt(text, i);
    if (mk) { i += mk.length - 1; continue; }
    if (ch === '"') { q = true; continue; }
    if (ch === '{' || ch === '[') stack.push(i);
    else if ((ch === '}' || ch === ']') && stack.length) {
      const start = stack.pop();
      const open = text[start];
      if ((open === '{' && ch === '}') || (open === '[' && ch === ']')) spans.push([start, i + 1]);
    }
  }
  return spans;
}
function maskJsonSlice(slice) {
  const reps = [];
  let i = 0;
  function ws() {
    while (i < slice.length && (slice[i] === ' ' || slice[i] === '\t' || slice[i] === '\n' || slice[i] === '\r')) i++;
  }
  function bad() { throw new Error('json'); }
  function takeString(sens) {
    if (slice[i] !== '"') bad();
    i++;
    const cs = i;
    while (i < slice.length) {
      if (slice[i] === '\\') { i += 2; continue; }
      if (slice[i] === '"') break;
      i++;
    }
    if (slice[i] !== '"') bad();
    const ce = i;
    i++;
    const content = slice.slice(cs, ce);
    if (!content.length) return;
    if (sens) {
      if (!isPassShape(content)) reps.push([cs, ce, marker(content)]);
      return;
    }
    const decoded = jsonUnescape(content);
    const asJson = maskJsonSlice(decoded);
    const masked = asJson != null ? asJson : maskAnchoredKeys(decoded, []);
    if (masked === decoded) return;
    reps.push([cs, ce, JSON.stringify(masked).slice(1, -1)]);
  }
  function takePrimitive(sens) {
    const mk = readMarkerAt(slice, i);
    if (mk) { i += mk.length; return; }
    const s = i;
    const c = slice[i];
    if (c === '-' || (c >= '0' && c <= '9')) {
      i++;
      while (i < slice.length && /[0-9eE+.\-]/.test(slice[i])) i++;
    } else if (slice.startsWith('true', i)) i += 4;
    else if (slice.startsWith('false', i)) i += 5;
    else if (slice.startsWith('null', i)) i += 4;
    else bad();
    if (!sens) return;
    const raw = slice.slice(s, i);
    if (raw.length && !isPassShape(raw)) reps.push([s, i, marker(raw)]);
  }
  function takeValue(sens) {
    ws();
    const c = slice[i];
    if (c === '"') takeString(sens);
    else if (c === '{') takeObject(sens);
    else if (c === '[') takeArray(sens);
    else takePrimitive(sens);
  }
  function takeObject(sens) {
    if (slice[i] !== '{') bad();
    i++;
    ws();
    if (slice[i] === '}') { i++; return; }
    for (;;) {
      ws();
      if (slice[i] !== '"') bad();
      const ks = i + 1;
      i++;
      while (i < slice.length) {
        if (slice[i] === '\\') { i += 2; continue; }
        if (slice[i] === '"') break;
        i++;
      }
      if (slice[i] !== '"') bad();
      const keyName = jsonUnescape(slice.slice(ks, i));
      i++;
      ws();
      if (slice[i] !== ':') bad();
      i++;
      takeValue(sens || isSensitiveKey(keyName));
      ws();
      if (slice[i] === ',') { i++; continue; }
      if (slice[i] === '}') { i++; return; }
      bad();
    }
  }
  function takeArray(sens) {
    if (slice[i] !== '[') bad();
    i++;
    ws();
    if (slice[i] === ']') { i++; return; }
    for (;;) {
      takeValue(sens);
      ws();
      if (slice[i] === ',') { i++; continue; }
      if (slice[i] === ']') { i++; return; }
      bad();
    }
  }
  try {
    takeValue(false);
    ws();
    if (i !== slice.length) return null;
  } catch (e) {
    return null;
  }
  let out = slice;
  for (let r = reps.length - 1; r >= 0; r--) {
    const rep = reps[r];
    out = out.slice(0, rep[0]) + rep[2] + out.slice(rep[1]);
  }
  return out;
}
function jsonSpanList(text) {
  if (text.indexOf('{') < 0 && text.indexOf('[') < 0) return [];
  const spans = balancedSpans(text);
  const chosen = [];
  const covered = [];
  for (let n = spans.length - 1; n >= 0; n--) {
    const s = spans[n][0];
    const e = spans[n][1];
    let inside = false;
    for (let c = 0; c < covered.length; c++) {
      if (s >= covered[c][0] && e <= covered[c][1]) { inside = true; break; }
    }
    if (inside) continue;
    const slice = text.slice(s, e);
    if (!jsonOk(slice) || maskJsonSlice(slice) == null) continue;
    chosen.push([s, e]);
    covered.push([s, e]);
  }
  chosen.sort((a, b) => a[0] - b[0]);
  return chosen;
}
function applyRanges(text, ranges, mapFn) {
  if (!ranges.length) return text;
  let out = '';
  let last = 0;
  for (let n = 0; n < ranges.length; n++) {
    const s = ranges[n][0];
    const e = ranges[n][1];
    if (s < last) continue;
    out += text.slice(last, s) + mapFn(text.slice(s, e), s, e);
    last = e;
  }
  return out + text.slice(last);
}
function applyJson(text) {
  return applyRanges(text, jsonSpanList(text), (slice) => {
    const masked = maskJsonSlice(slice);
    return masked == null ? slice : masked;
  });
}
function cookieSegments(body) {
  const parts = [];
  let i = 0;
  let quote = '';
  let start = 0;
  let unpaired = false;
  while (i <= body.length) {
    const ch = i === body.length ? ';' : body[i];
    if (i < body.length && quote) {
      if (ch === quote) quote = '';
      i++;
      continue;
    }
    if (i < body.length && (ch === '"' || ch === "'")) { quote = ch; i++; continue; }
    if (ch === ';' || i === body.length) {
      if (quote) unpaired = true;
      parts.push({ text: body.slice(start, i), unpaired: unpaired || quote !== '', start: start });
      if (unpaired || quote) {
        parts[parts.length - 1].rest = body.slice(start);
        return parts;
      }
      i++;
      start = i;
      continue;
    }
    i++;
  }
  return parts;
}
function maskCookieBody(body, setCookie) {
  const parts = cookieSegments(body);
  let out = '';
  for (let n = 0; n < parts.length; n++) {
    const part = parts[n];
    if (part.rest != null) return out + marker(part.rest);
    const segment = part.text;
    const eq = segment.indexOf('=');
    const trimmed = segment.trim();
    if (eq < 0) {
      if (!n) return marker(body);
      if (setCookie && COOKIE_ATTRS.has(trimmed.toLowerCase())) {
        out += segment;
        if (n < parts.length - 1) out += ';';
        continue;
      }
      return out + marker(body.slice(part.start));
    }
    const name = segment.slice(0, eq);
    if (isPassShape(segment.trim())) {
      out += segment;
      if (n < parts.length - 1) out += ';';
      continue;
    }
    const value = segment.slice(eq + 1);
    const attr = name.trim().toLowerCase();
    const keepAttr = n > 0 && setCookie && COOKIE_ATTRS.has(attr);
    if (keepAttr || !value || isPassShape(value)) out += segment;
    else out += name + '=' + marker(value);
    if (n < parts.length - 1) out += ';';
  }
  return out;
}
function applyCookies(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const end = eol(text, i);
    const line = text.slice(i, end);
    const m = COOKIE_RE.exec(line);
    out += m ? m[1] + m[2] + m[3] + maskCookieBody(m[4], m[2].toLowerCase() === 'set-cookie') : line;
    if (end >= text.length) break;
    const br = lineBreakEnd(text, end);
    out += text.slice(end, br);
    i = br;
  }
  return out;
}
function maskPair(part, query) {
  const hash = part.indexOf('#');
  const eq = part.indexOf('=');
  if (eq < 0 || (hash >= 0 && hash < eq)) return part;
  const vend = hash > eq ? hash : part.length;
  const key = part.slice(0, eq);
  const value = part.slice(eq + 1, vend);
  const tail = part.slice(vend);
  if (!value || !isSensitiveKey(key, query) || isPassShape(value)) return part;
  return key + '=' + marker(value) + tail;
}
function maskAmpList(body, query) {
  let out = '';
  let i = 0;
  while (i < body.length) {
    let j = i;
    while (j < body.length && body[j] !== '&') j++;
    out += maskPair(body.slice(i, j), query);
    if (j < body.length) { out += '&'; j++; }
    i = j;
  }
  return out;
}
function nextRunEnd(text, i) {
  let j = i;
  while (j < text.length) {
    const mk = readMarkerAt(text, j);
    if (mk) { j += mk.length; continue; }
    const c = text[j];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') break;
    j++;
  }
  return j;
}
function isFormRun(run) {
  if (run.includes('://') || !run.includes('&') || !run.includes('=')) return false;
  const parts = run.split('&');
  if (parts.length < 2) return false;
  for (let i = 0; i < parts.length; i++) if (!parts[i].includes('=')) return false;
  return true;
}
function wordContinues(text, at) {
  if (text[at] !== ' ' && text[at] !== '\t') return false;
  let k = at + 1;
  while (text[k] === ' ' || text[k] === '\t') k++;
  const c = text[k];
  if (!c || c === '\n' || c === '\r') return false;
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
}
function lastAmpPairKey(run) {
  const amp = run.lastIndexOf('&');
  const pair = amp < 0 ? run : run.slice(amp + 1);
  const hash = pair.indexOf('#');
  const eq = pair.indexOf('=');
  if (eq <= 0 || (hash >= 0 && hash < eq)) return '';
  return pair.slice(0, eq);
}
// Raw space after a sensitive value means the text is not urlencoded.
function spaceCutSensitive(text, runEnd, run, query) {
  if (!wordContinues(text, runEnd)) return false;
  const key = lastAmpPairKey(run);
  return key !== '' && isSensitiveKey(key, query);
}
function pushUrlRanges(text, ranges) {
  const urls = queryUrlRanges(text);
  for (let u = 0; u < urls.length; u++) {
    const s = urls[u][0];
    const e = urls[u][1];
    const slice = text.slice(s, e);
    const q = slice.indexOf('?');
    if (q < 0) continue;
    const query = slice.slice(q + 1);
    if (!spaceCutSensitive(text, e, query, true)) {
      ranges.push([s, e, 'url']);
      continue;
    }
    const amp = query.lastIndexOf('&');
    if (amp >= 0) ranges.push([s, s + q + 1 + amp + 1, 'url']);
  }
}
// End index of the form run rule 4 must not own. -1 when the run is not a bounded form.
// A sensitive value cut by a raw space is excluded so rule 4 can run to end of line.
function boundedFormEnd(text, i, j) {
  const run = text.slice(i, j);
  if (!isFormRun(run)) return -1;
  if (!spaceCutSensitive(text, j, run, false)) return j;
  const amp = run.lastIndexOf('&');
  if (amp < 0) return -1;
  return i + amp + 1;
}
function applyQueryAndForm(text) {
  const ranges = [];
  pushUrlRanges(text, ranges);
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
    const j = nextRunEnd(text, i);
    const end = boundedFormEnd(text, i, j);
    if (end > i) ranges.push([i, end, 'form']);
    i = j;
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const kept = [];
  let last = 0;
  for (let n = 0; n < ranges.length; n++) {
    if (ranges[n][0] < last) continue;
    kept.push(ranges[n]);
    last = ranges[n][1];
  }
  return applyRanges(text, kept, (slice, s, e) => {
    const kind = kept.find((r) => r[0] === s && r[1] === e);
    if (kind && kind[2] === 'url') {
      const q = slice.indexOf('?');
      return slice.slice(0, q + 1) + maskAmpList(slice.slice(q + 1), true);
    }
    return maskAmpList(slice, false);
  });
}
function mergeRanges(ranges) {
  if (!ranges.length) return [];
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [ranges[0].slice()];
  for (let i = 1; i < ranges.length; i++) {
    const prev = out[out.length - 1];
    if (ranges[i][0] <= prev[1]) prev[1] = Math.max(prev[1], ranges[i][1]);
    else out.push(ranges[i].slice());
  }
  return out;
}
function protectedRanges(text) {
  const ranges = jsonSpanList(text).map((r) => [r[0], r[1]]);
  let i = 0;
  while (i < text.length) {
    const end = eol(text, i);
    if (COOKIE_RE.test(text.slice(i, end))) ranges.push([i, end]);
    i = end >= text.length ? end : lineBreakEnd(text, end);
  }
  i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
    const j = nextRunEnd(text, i);
    const end = boundedFormEnd(text, i, j);
    if (end > i) ranges.push([i, end]);
    i = j;
  }
  return mergeRanges(ranges);
}
function readKeyAt(text, i) {
  let j = i;
  while (j < text.length && /[A-Za-z0-9_.%-]/.test(text[j])) j++;
  if (j === i) return null;
  return { text: text.slice(i, j), end: j };
}
function readSepAt(text, i) {
  let j = i;
  while (text[j] === ' ' || text[j] === '\t') j++;
  if (text[j] !== ':' && text[j] !== '=') return null;
  const ch = text[j];
  j++;
  while (text[j] === ' ' || text[j] === '\t') j++;
  return { ch: ch, valueStart: j };
}
function matchKey(text, i) {
  if (i > 0 && /[A-Za-z0-9_.%-]/.test(text[i - 1])) return null;
  let start = i;
  let key = null;
  let sep = null;
  const qch = text[i];
  if (qch === '"' || qch === "'" || qch === '`') {
    const wrapped = readKeyAt(text, i + 1);
    if (wrapped && text[wrapped.end] === qch) {
      const wrappedSep = readSepAt(text, wrapped.end + 1);
      if (wrappedSep) {
        key = wrapped;
        sep = wrappedSep;
        start = i + 1;
      }
    }
  }
  if (!key) {
    key = readKeyAt(text, i);
    if (!key) return null;
    sep = readSepAt(text, key.end);
    if (!sep) return null;
    start = i;
  }
  const prev = start > 0 ? text[start - 1] : '';
  return { key: key.text, sep: sep.ch, valueStart: sep.valueStart, query: sep.ch === '=' && (prev === '?' || prev === '&' || prev === '#') };
}
function classifyScheme(first) {
  const m = /^([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)([ \t]*)([\s\S]*)$/.exec(first);
  if (!m || !isKeyedSchemeWord(m[1])) return null;
  if (!m[3]) return { lone: true, word: m[1], ws: m[2] };
  if (!m[2]) return null;
  return { lone: false, word: m[1], restSkip: m[1].length + m[2].length };
}
function formatLoneTail(text, nlAt, parentIndent) {
  if (nlAt >= text.length || (text[nlAt] !== '\n' && text[nlAt] !== '\r')) return null;
  const j = lineBreakEnd(text, nlAt);
  if (j >= text.length) return null;
  const indent = leadingWs(text, j);
  const content = j + indent;
  if (content >= text.length || text[content] === '\n' || text[content] === '\r') return null;
  if (text.startsWith('<masked len=', content)) return null;
  const name = headerNameAt(text, content);
  if (name && (isReadableHeaderName(name) || isSensitiveKey(name))) return null;
  const lineEnd = eol(text, content);
  const end = extendFolds(text, lineEnd, parentIndent);
  const chunk = text.slice(content, end);
  return { end: end, out: text.slice(nlAt, content) + (chunk ? marker(chunk) : '') };
}
function queryValueEnd(text, valueStart) {
  let i = valueStart;
  const scheme = /^([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)([ \t]+)/.exec(text.slice(i));
  if (scheme && isKeyedSchemeWord(scheme[1])) i += scheme[1].length + scheme[2].length;
  while (i < text.length) {
    const mk = readMarkerAt(text, i);
    if (mk) { i += mk.length; continue; }
    const c = text[i];
    if (c === '&' || c === '#' || c === '\n' || c === '\r') break;
    if (c === ' ' || c === '\t') {
      if (wordContinues(text, i)) return eol(text, i);
      break;
    }
    i++;
  }
  return i;
}
function maskKeyedValue(text, valueStart, parentIndent, sep, query) {
  const lineEnd = eol(text, valueStart);
  const bound = query ? queryValueEnd(text, valueStart) : lineEnd;
  const first = text.slice(valueStart, Math.min(lineEnd, bound));
  const scheme = classifyScheme(first);
  if (!query && scheme && scheme.lone) {
    const low = scheme.word.toLowerCase();
    const keep = sep === ':' && (low === 'bearer' || low === 'basic');
    let out = (keep ? scheme.word : marker(scheme.word)) + scheme.ws;
    const tail = formatLoneTail(text, lineEnd, parentIndent);
    if (!tail) return { end: lineEnd, out: out };
    return { end: tail.end, out: out + tail.out };
  }
  const fullEnd = query ? bound : extendFolds(text, lineEnd, parentIndent);
  const full = text.slice(valueStart, fullEnd);
  if (isPassShape(full)) return { end: fullEnd, out: full };
  if (full.includes('<masked')) return { end: fullEnd, out: marker(full) };
  if (scheme && !scheme.lone) {
    const low = scheme.word.toLowerCase();
    const keep = sep === ':' && (low === 'bearer' || low === 'basic');
    const rest = text.slice(valueStart + scheme.restSkip, fullEnd);
    const head = keep ? scheme.word : marker(scheme.word);
    return { end: fullEnd, out: head + ' ' + marker(rest) };
  }
  return { end: fullEnd, out: full ? marker(full) : '' };
}
function maskAnchoredKeys(text, ranges) {
  let ri = 0;
  function covered(i) {
    while (ri < ranges.length && ranges[ri][1] <= i) ri++;
    if (ri < ranges.length && ranges[ri][0] <= i) return ranges[ri][1];
    return -1;
  }
  let out = '';
  let i = 0;
  while (i < text.length) {
    const jump = covered(i);
    if (jump > i) { out += text.slice(i, jump); i = jump; continue; }
    const mk = readMarkerAt(text, i);
    if (mk) { out += mk; i += mk.length; continue; }
    if (TRUNC_RE.test(text.slice(i))) {
      const t = TRUNC_RE.exec(text.slice(i))[0];
      out += t;
      i += t.length;
      continue;
    }
    const found = matchKey(text, i);
    if (!found || !isSensitiveKey(found.key, found.query)) {
      out += text[i];
      i++;
      continue;
    }
    const masked = maskKeyedValue(text, found.valueStart, lineIndentAt(text, i), found.sep, found.query);
    out += text.slice(i, found.valueStart) + masked.out;
    i = masked.end;
  }
  return out;
}
function applyKeys(text) {
  return maskAnchoredKeys(text, protectedRanges(text));
}
function applyKeyless(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const mk = readMarkerAt(text, i);
    if (mk) { out += mk; i += mk.length; continue; }
    if (TRUNC_RE.test(text.slice(i))) {
      const t = TRUNC_RE.exec(text.slice(i))[0];
      out += t;
      i += t.length;
      continue;
    }
    const prev = i > 0 ? text[i - 1] : '';
    if (/[A-Za-z0-9-]/.test(prev) || !/[A-Za-z]/.test(text[i] || '')) {
      out += text[i];
      i++;
      continue;
    }
    let j = i + 1;
    while (j < text.length && /[A-Za-z0-9-]/.test(text[j])) j++;
    const word = text.slice(i, j);
    const low = word.toLowerCase();
    if ((low === 'bearer' || low === 'basic') && (text[j] === ' ' || text[j] === '\t')) {
      let k = j;
      while (text[k] === ' ' || text[k] === '\t') k++;
      if (!text.startsWith('<masked len=', k)) {
        TOKEN68_RE.lastIndex = k;
        const tok = TOKEN68_RE.exec(text);
        if (tok && tok.index === k && tok[0]) {
          out += text.slice(i, k) + marker(tok[0]);
          i = k + tok[0].length;
          continue;
        }
      }
    }
    if (isKeylessScheme(word)) {
      let k = j;
      while (text[k] === ' ' || text[k] === '\t') k++;
      if (k >= text.length || text[k] === '\n' || text[k] === '\r') {
        const tail = k < text.length ? formatLoneTail(text, k, lineIndentAt(text, i)) : null;
        if (tail) {
          out += text.slice(i, k) + tail.out;
          i = tail.end;
          continue;
        }
      }
    }
    out += word;
    i = j;
  }
  return out;
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
    const eq = pair.indexOf('=');
    if (eq < 0) return pathOpaque(pair) ? marker(pair) : pair;
    const k = pair.slice(0, eq); const v = pair.slice(eq + 1);
    if (!v || PLACEHOLDER.test(v)) return pair;
    return (isSensitiveKey(k, query) || pathOpaque(v)) ? k + '=' + marker(v) : pair;
  }).join('&');
}
function maskUrl(t) {
  const m = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(t);
  if (!m) return marker(t);
  const scheme = m[1]; const auth = m[2]; const path = m[3]; const query = m[4]; const hash = m[5];
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
function maskBodyOnce(text) {
  let s = applyJson(text);
  s = applyCookies(s);
  s = applyQueryAndForm(s);
  s = applyKeys(s);
  s = applyKeyless(s);
  s = s.replace(JWT_RE, (j) => marker(j)).replace(VENDOR_RE, (v) => marker(v))
    .replace(USERINFO_RE, (all, a, v, at) => a + marker(v) + at);
  const parts = s.split(/(<masked len=\d+>)/);
  return parts.map((part, n) => (n % 2 ? part : tokenPass(part, n + 1 < parts.length))).join('');
}
function maskBody(text) {
  const once = maskBodyOnce(text);
  if (!/<masked len=\d+>(?:<masked|[^<\s])/.test(once)) return once;
  const twice = maskBodyOnce(once);
  return twice === once ? once : maskBodyOnce(twice);
}
function maskText(text) {
  const t = String(text);
  const already = /…<truncated len=\d+>$/.exec(t);
  if (already) return maskBody(t.slice(0, t.length - already[0].length)) + already[0];
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
