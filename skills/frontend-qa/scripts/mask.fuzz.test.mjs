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
const EXPLICIT = [
  { input: "Can't log in, password: abcd'1234efgh", needle: '1234efgh' },
  { input: 'if a < b then password=abcd>1234efgh', needle: '1234efgh' },
  { input: '(see note password: abcd)1234efgh', needle: '1234efgh' },
  { input: '(password: hunter2)', needle: 'hunter2' },
  { input: 'Login failed (password: hunter2) retry', needle: 'hunter2' },
  { input: 'error(token: abcd1234efgh)', needle: 'abcd1234efgh' },
  { input: '(password=Ab9!defGhij)', needle: 'defGhij' },
  { input: '(Authorization: Bearer Ab9!defGhij)', needle: 'defGhij' },
  { input: 'password: Ab9&zz88QQ', needle: 'zz88QQ' },
  { input: 'token=Ab9&zz88QQ', needle: 'zz88QQ' },
  { input: '(password=Ab9&defGhij)', needle: 'defGhij' },
  { input: '(password: abc).next', needle: 'next' },
  { input: '{ password: Ab}Zq9 Wk7Vt }', needle: 'Zq9' },
];

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
    const input = row.input || '';
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

const FORMS = keyForms();
const SUFFIXES = PREFIXES.map((prefix) => suffixesFor(prefix.text));
let INPUTS = 0;
for (const suffixes of SUFFIXES) INPUTS += suffixes.length * FORMS.length * PUNCT.length * 2;

function scanPrefixes(mod, workers) {
  let leaks = 0;
  let calls = 0;
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
          const grams = gramsOf(value);
          for (let s = 0; s < suffixes.length; s += 1) {
            const input = prefix + key + value + suffixes[s];
            for (let f = 0; f < SURFACES.length; f += 1) {
              const out = SURFACES[f][1](input);
              calls += 1;
              for (let g = 0; g < grams.length; g += 1) {
                if (out.includes(grams[g])) {
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
  }
  return { leaks, calls, examples };
}

function explicitLeaks() {
  const failed = [];
  for (const row of EXPLICIT) {
    for (const [name, fn] of SURFACES) {
      const out = fn(row.input);
      if (out.includes(row.needle)) failed.push(`${name} ${JSON.stringify(row.input)} => ${JSON.stringify(out)}`);
    }
  }
  return failed;
}

if (!isMainThread) {
  parentPort.postMessage(scanPrefixes(workerData.mod, workerData.workers));
} else {
  test('unquoted sensitive values hide every 4-gram across the fuzz matrix', async () => {
    assert.equal(PUNCT.length, 32);
    assert.equal(PREFIXES.length, 18);
    const started = performance.now();
    const workers = 4;
    const parts = await Promise.all(Array.from({ length: workers }, (_, mod) => new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), { workerData: { mod, workers } });
      worker.once('message', resolve);
      worker.once('error', reject);
    })));
    let leaks = 0;
    let calls = 0;
    const examples = [];
    for (const part of parts) {
      leaks += part.leaks;
      calls += part.calls;
      for (const example of part.examples) {
        if (examples.length < 8) examples.push(example);
      }
    }
    const explicit = explicitLeaks();
    const ms = performance.now() - started;
    console.log(`fuzz inputs ${INPUTS} calls ${calls} leaks ${leaks} explicit ${explicit.length} ${ms.toFixed(3)}ms`);
    for (const line of explicit) console.log(`explicit fail ${line}`);
    assert.equal(calls, INPUTS * SURFACES.length);
    assert.equal(leaks, 0, examples.join('\n'));
    assert.equal(explicit.length, 0, explicit.join('\n'));
    assert.ok(ms < 5000, `fuzz ${ms}`);
  });

  test('maskText, maskConsole, and maskBody are idempotent on a fixed fuzz sample', () => {
    const sample = [];
    for (const row of EXPLICIT) sample.push(row.input);
    let index = 0;
    const stride = Math.max(1, Math.floor(INPUTS / 2000));
    for (let p = 0; p < PREFIXES.length; p += 1) {
      const prefix = PREFIXES[p].text;
      const suffixes = SUFFIXES[p];
      for (let k = 0; k < FORMS.length; k += 1) {
        const key = FORMS[k];
        for (let c = 0; c < PUNCT.length; c += 1) {
          const punct = PUNCT[c];
          const values = [`Ab9${punct}${TAIL}`, `A${punct}b9${TAIL}`];
          for (let v = 0; v < values.length; v += 1) {
            for (let s = 0; s < suffixes.length; s += 1) {
              if (index % stride === 0) sample.push(prefix + key + values[v] + suffixes[s]);
              index += 1;
            }
          }
        }
      }
    }
    assert.equal(index, INPUTS);
    assert.ok(sample.length >= 2000, `sample ${sample.length}`);
    for (const input of sample) {
      for (const [, fn] of SURFACES) {
        const once = fn(input);
        assert.equal(fn(once), once);
      }
    }
    console.log(`fuzz idempotence ${sample.length}`);
  });
}
