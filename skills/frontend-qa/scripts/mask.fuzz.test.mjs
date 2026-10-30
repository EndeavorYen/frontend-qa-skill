import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { test } from 'node:test';
import { isSensitiveKey, maskBody, maskConsole, maskText } from './mask.mjs';

const TAIL = 'zz88QQ';
const PUNCT = [];
for (let code = 33; code <= 126; code += 1) {
  const ch = String.fromCharCode(code);
  if (!/[A-Za-z0-9]/.test(ch)) PUNCT.push(ch);
}
const PREFIXES = [
  { id: 'none', text: '' },
  { id: 'cant', text: "Can't log in, " },
  { id: 'lt', text: 'if a < b then ' },
  { id: 'see', text: '(see note ' },
  { id: 'say', text: 'say "hi ' },
  { id: 'tick', text: 'x `y ' },
  { id: 'paren', text: '(' },
  { id: 'bracket', text: '[' },
  { id: 'brace', text: '{' },
  { id: 'squote', text: "'" },
  { id: 'dquote', text: '"' },
  { id: 'btick', text: '`' },
  { id: 'error', text: 'error(' },
  { id: 'login', text: 'Login failed (' },
  { id: 'curl', text: "curl -H '" },
  { id: 'url', text: 'https://h/p?a=1&' },
  { id: 'json', text: '{"' },
  { id: 'header', text: 'Accept: text/plain\n' },
];
const OPEN_CH = new Set(['(', '[', '{', "'", '"', '`']);
const CLOSE_OF = { '(': ')', '[': ']', '{': '}', "'": "'", '"': '"', '`': '`' };
const SURFACES = [
  ['maskText', maskText],
  ['maskConsole', maskConsole],
  ['maskBody', maskBody],
];
const SPEC_BREAK = '§';

function unbreak(value) {
  return typeof value === 'string' ? value.replaceAll(SPEC_BREAK, '') : value;
}

function prefixCloser(prefix) {
  const stack = [];
  for (const ch of prefix) {
    if (OPEN_CH.has(ch)) {
      stack.push(ch);
      continue;
    }
    if (stack.length && CLOSE_OF[stack[stack.length - 1]] === ch) stack.pop();
  }
  return stack.length ? CLOSE_OF[stack[stack.length - 1]] : '';
}

function suffixesFor(prefix) {
  const suffixes = ['', ' next_key: v', ' [200]'];
  const closer = prefixCloser(prefix);
  if (closer) suffixes.push(closer);
  return suffixes;
}

function keyForms() {
  const cases = JSON.parse(readFileSync(new URL('./mask.cases.json', import.meta.url), 'utf8'));
  const keys = new Set();
  const re = /([A-Za-z_][A-Za-z0-9_.%-]*)\s*[:=]/g;
  for (const row of cases) {
    if (row.kind === 'key' && row.expect === 'masked' && /^[A-Za-z0-9_.%-]+$/.test(row.input)) keys.add(row.input);
    const input = unbreak(row.input || '');
    re.lastIndex = 0;
    let found;
    while ((found = re.exec(input))) {
      if (isSensitiveKey(found[1])) keys.add(found[1]);
    }
  }
  const forms = [];
  for (const key of keys) {
    forms.push(`${key}: `);
    forms.push(`${key}=`);
  }
  forms.push(
    'Authorization: Bearer ',
    'Authorization: Basic ',
    'Proxy-Authorization: Bearer ',
    'Proxy-Authorization=Bearer ',
  );
  return forms.sort();
}

function gramsOf(value) {
  const grams = [];
  for (let i = 0; i + 4 <= value.length; i += 1) grams.push(value.slice(i, i + 4));
  return grams;
}

// A URL query in the prefix ends the sensitive value at & # or whitespace.
function sensitivePart(prefix, key, value) {
  const q = prefix.lastIndexOf('?');
  if (q < 0 || /\s/.test(prefix.slice(q))) return value;
  if (!/[A-Za-z][A-Za-z0-9+.-]*:\/\/\S*$/.test(prefix.slice(0, q))) return value;
  const cut = value.search(/[&#\s]/);
  return cut < 0 ? value : value.slice(0, cut);
}

function markerBroken(out) {
  return /<masked(?! len=[1-9][0-9]*>)/.test(out) || /> len=\d+>/.test(out);
}

function siblingLines(input) {
  const lines = input.split('\n');
  let keyIndent = null;
  const siblings = [];
  for (const line of lines) {
    const indent = /^[ \t]*/.exec(line)[0].length;
    const body = line.slice(indent);
    const name = /^([A-Za-z0-9_.%-]+)[ \t]*[:=]/.exec(body);
    if (keyIndent == null && name && isSensitiveKey(name[1])) {
      keyIndent = indent;
      continue;
    }
    if (keyIndent != null && indent === keyIndent && body.trim()) siblings.push(line);
  }
  return siblings;
}

function leaked(input, out, secret) {
  const grams = gramsOf(secret);
  let rest = out;
  for (const line of siblingLines(input)) {
    const idx = rest.indexOf(line);
    if (idx >= 0) rest = rest.slice(0, idx) + rest.slice(idx + line.length);
  }
  for (let g = 0; g < grams.length; g += 1) {
    if (rest.includes(grams[g])) return true;
  }
  return false;
}

const FORMS = keyForms();
const SUFFIXES = PREFIXES.map((prefix) => suffixesFor(prefix.text));
let INPUTS = 0;
for (const suffixes of SUFFIXES) INPUTS += suffixes.length * FORMS.length * PUNCT.length * 2;

const DIM_SEPS = [':', ': ', '=', ':\t'];
const DIM_STARTS = ['', '""', "''", '``', '&', ')', ']', ',', ';', '<', '>', '}'];
const DIM_PREFIXES = ['', '- ', '* ', '<td>'];
const DIM_SUFFIXES = ['.', '))', '}}', ']]', ' next: v', ' [200]'];
const DIM_KEYS = ['password', 'token', 'secret', 'api_key'];
const JSON_WRAPS = [
  (body) => `{"msg":"${body}"}`,
  (body) => `{"level":"error","msg":"${body}"}`,
  (body) => `[{"line":"${body}"}]`,
];
const JSON_SEPS = [': ', '='];
const WORDY = `${TAIL} ${TAIL}`;

function dimensionInputs() {
  const rows = [];
  for (const prefix of DIM_PREFIXES) {
    for (const key of DIM_KEYS) {
      for (const sep of DIM_SEPS) {
        for (const start of DIM_STARTS) {
          for (const suffix of DIM_SUFFIXES) {
            rows.push({
              input: `${prefix}${key}${sep}${start}${TAIL}${suffix}`,
              secret: TAIL,
              sibling: false,
            });
          }
        }
      }
    }
  }
  rows.push({ input: `password: ${TAIL}\nusername: ${TAIL}`, secret: TAIL, sibling: true });
  rows.push({ input: `password: ${TAIL}\n  note: ${TAIL}`, secret: TAIL, sibling: false });
  for (const key of DIM_KEYS) {
    for (const sep of JSON_SEPS) {
      for (const wrap of JSON_WRAPS) {
        rows.push({ input: wrap(`${key}${sep}${TAIL}`), secret: TAIL, sibling: false });
      }
    }
    rows.push({ input: `user=bob&${key}=${WORDY}`, secret: WORDY, sibling: false });
    rows.push({ input: `https://x.test/login?${key}=${WORDY}`, secret: WORDY, sibling: false });
    rows.push({ input: `a=1&${key}=${WORDY}`, secret: WORDY, sibling: false });
    rows.push({ input: `#${key}: ${WORDY}`, secret: WORDY, sibling: false });
  }
  rows.push({ input: 'user=bob&password=my secret phrase', secret: 'secret phrase', phrase: true });
  rows.push({ input: '#password: hunter two words', secret: 'two words', phrase: true });
  rows.push({ input: '{"msg":"login failed password: hunter2"}', secret: 'hunter2', phrase: true });
  return rows;
}

const DIM_INPUTS = dimensionInputs();

function explicitMisses() {
  const cases = JSON.parse(readFileSync(new URL('./mask.cases.json', import.meta.url), 'utf8'));
  const failed = [];
  for (const row of cases) {
    if (row.group !== 'R52' || typeof row.output !== 'string') continue;
    const input = unbreak(row.input);
    const output = unbreak(row.output);
    const checks = input.length > 2000 ? [['maskBody', maskBody]] : SURFACES;
    for (const [name, fn] of checks) {
      const out = fn(input);
      if (out !== output) failed.push(`${name} ${JSON.stringify(input).slice(0, 80)} => ${JSON.stringify(out).slice(0, 80)}`);
    }
  }
  return failed;
}

function scanPrefixes(mod, workers) {
  let leaks = 0;
  let calls = 0;
  let idemFails = 0;
  let markerFails = 0;
  const examples = [];
  let seq = 0;
  for (let p = 0; p < PREFIXES.length; p += 1) {
    const prefix = PREFIXES[p].text;
    const suffixes = SUFFIXES[p];
    for (let k = 0; k < FORMS.length; k += 1) {
      if (seq % workers !== mod) {
        seq += 1;
        continue;
      }
      seq += 1;
      const key = FORMS[k];
      for (let c = 0; c < PUNCT.length; c += 1) {
        const punct = PUNCT[c];
        const values = [`Ab9${punct}${TAIL}`, `A${punct}b9${TAIL}`];
        for (let v = 0; v < values.length; v += 1) {
          const value = values[v];
          const secret = sensitivePart(prefix, key, value);
          const cookieHeader = /^(?:set-)?cookie\s*:/i.test(key);
          const tailAt = value.length - TAIL.length;
          for (let s = 0; s < suffixes.length; s += 1) {
            const input = prefix + key + value + suffixes[s];
            for (let f = 0; f < SURFACES.length; f += 1) {
              const fn = SURFACES[f][1];
              const out = fn(input);
              calls += 1;
              if (fn(out) !== out) {
                idemFails += 1;
                if (examples.length < 8) examples.push(`idem ${SURFACES[f][0]} ${JSON.stringify(input)} => ${JSON.stringify(out)}`);
              }
              if (markerBroken(out)) {
                markerFails += 1;
                if (examples.length < 8) examples.push(`marker ${SURFACES[f][0]} ${JSON.stringify(input)} => ${JSON.stringify(out)}`);
              }
              const grams = gramsOf(secret);
              for (let g = 0; g < grams.length; g += 1) {
                if (!out.includes(grams[g])) continue;
                if (cookieHeader && secret === value && g + 4 <= tailAt) continue;
                leaks += 1;
                if (examples.length < 8) examples.push(`${SURFACES[f][0]} ${JSON.stringify(input)} => ${JSON.stringify(out)}`);
                break;
              }
            }
          }
        }
      }
    }
  }
  return { leaks, calls, idemFails, markerFails, examples };
}

function scanDimensions(mod, workers) {
  let leaks = 0;
  let calls = 0;
  let idemFails = 0;
  let markerFails = 0;
  const examples = [];
  for (let i = mod; i < DIM_INPUTS.length; i += workers) {
    const row = DIM_INPUTS[i];
    for (let f = 0; f < SURFACES.length; f += 1) {
      const fn = SURFACES[f][1];
      const out = fn(row.input);
      calls += 1;
      if (fn(out) !== out) {
        idemFails += 1;
        if (examples.length < 8) examples.push(`idem ${JSON.stringify(row.input)} => ${JSON.stringify(out)}`);
      }
      if (markerBroken(out)) {
        markerFails += 1;
        if (examples.length < 8) examples.push(`marker ${JSON.stringify(row.input)} => ${JSON.stringify(out)}`);
      }
      const hit = row.phrase ? out.includes(row.secret) : leaked(row.input, out, row.secret);
      if (hit) {
        leaks += 1;
        if (examples.length < 8) examples.push(`${JSON.stringify(row.input)} => ${JSON.stringify(out)}`);
      }
    }
  }
  return { leaks, calls, idemFails, markerFails, examples };
}

if (!isMainThread) {
  parentPort.postMessage({
    prefix: scanPrefixes(workerData.mod, workerData.workers),
    dim: scanDimensions(workerData.mod, workerData.workers),
  });
} else {
  test('unquoted sensitive values hide every 4-gram across the fuzz matrix', async () => {
    assert.equal(PUNCT.length, 32);
    assert.equal(PREFIXES.length, 18);
    const dimGrid = DIM_PREFIXES.length * DIM_KEYS.length * DIM_SEPS.length * DIM_STARTS.length * DIM_SUFFIXES.length;
    const dimJson = JSON_WRAPS.length * DIM_KEYS.length * JSON_SEPS.length;
    const dimWordy = DIM_KEYS.length * 4;
    assert.equal(DIM_INPUTS.length, dimGrid + 2 + dimJson + dimWordy + 3);
    const started = performance.now();
    const workers = 4;
    const parts = await Promise.all(Array.from({ length: workers }, (_, mod) => new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), { workerData: { mod, workers } });
      worker.once('message', resolve);
      worker.once('error', reject);
    })));
    let leaks = 0;
    let calls = 0;
    let idemFails = 0;
    let markerFails = 0;
    const examples = [];
    for (const part of parts) {
      for (const piece of [part.prefix, part.dim]) {
        leaks += piece.leaks;
        calls += piece.calls;
        idemFails += piece.idemFails;
        markerFails += piece.markerFails;
        for (const example of piece.examples) {
          if (examples.length < 12) examples.push(example);
        }
      }
    }
    const explicit = explicitMisses();
    const ms = performance.now() - started;
    const idemN = INPUTS + DIM_INPUTS.length;
    console.log(`fuzz inputs ${INPUTS} dim ${DIM_INPUTS.length} calls ${calls} leaks ${leaks} idem ${idemN - idemFails}/${idemN} markerFails ${markerFails} explicit ${explicit.length} ${ms.toFixed(3)}ms`);
    for (const line of explicit.slice(0, 8)) console.log(`explicit fail ${line}`);
    assert.equal(calls, (INPUTS + DIM_INPUTS.length) * SURFACES.length);
    assert.equal(leaks, 0, examples.join('\n'));
    assert.equal(idemFails, 0, examples.join('\n'));
    assert.equal(markerFails, 0, examples.join('\n'));
    assert.equal(explicit.length, 0, explicit.join('\n'));
  });
}
