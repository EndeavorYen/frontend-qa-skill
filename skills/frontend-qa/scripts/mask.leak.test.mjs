import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import { mask, maskBody, maskConsole, maskText } from './mask.mjs';

const SECRET = 'abcd1234efgh';
const LETTER_SECRET = 'mysecretphrase';
const LENGTHS = [1, 3, 12, 20, 100, 2000, 4095, 4096, 4097, 4100, 5000, 9000];
const POSITIONS = ['start', 'middle', 'end'];
const FORMS = ['header', 'single', 'double', 'backtick', 'json', 'nested', 'array', 'folded', 'lone-scheme-folded', 'letters-only-folded', 'no-key-scheme', 'indented-nonsensitive-key-after-scheme', 'quoted+fold', 'CRLF-fold', 'AWS4-folded', 'SharedKey'];

function plant(length, position) {
  const pad = 'A'.repeat(length);
  if (position === 'start') return SECRET + pad;
  if (position === 'end') return pad + SECRET;
  if (position === 'middle') {
    const mid = Math.floor(length / 2);
    return pad.slice(0, mid) + SECRET + pad.slice(mid);
  }
  throw new Error(`unknown position ${position}`);
}

function plantLetters(length, position) {
  const pad = 'a'.repeat(length);
  if (position === 'start') return `${LETTER_SECRET} ${pad}`;
  if (position === 'end') return `${pad} ${LETTER_SECRET}`;
  if (position === 'middle') {
    const mid = Math.floor(length / 2);
    return `${pad.slice(0, mid)} ${LETTER_SECRET} ${pad.slice(mid)}`;
  }
  throw new Error(`unknown position ${position}`);
}

const MID_DELIMS = ['"', "'", '`', ')', '<', '>', ']', '}'];

function wrap(form, value, length, position, folded) {
  switch (form) {
    case 'header':
      return `Authorization: ${value}`;
    case 'single':
      return `token='${value}'`;
    case 'double':
      return `token="${value}"`;
    case 'backtick':
      return `token=\`${value}\``;
    case 'json':
      return `{"password":"${value}"}`;
    case 'nested':
      return `{"secret":{"a":"${value}"}}`;
    case 'array':
      return `{"credentials":["${value}"]}`;
    case 'folded':
      return `Authorization: Bearer\n  ${value}`;
    case 'lone-scheme-folded':
      return `Authorization: Bearer\n${value}`;
    case 'letters-only-folded':
      return `Authorization: Bearer\n  ${folded == null ? plantLetters(length, position) : folded}`;
    case 'no-key-scheme':
      return `Bearer\n  ${value}`;
    case 'indented-nonsensitive-key-after-scheme':
      return `Authorization: Bearer\n  X-Foo: ${value}`;
    case 'quoted+fold':
      return `password="${value}"\n  continued`;
    case 'CRLF-fold':
      return `Authorization: Bearer\r\n  ${value}`;
    case 'AWS4-folded':
      return `Authorization: AWS4-HMAC-SHA256\n  Credential=AKIA/20261027/us-east-1/s3/aws4_request,\n  SignedHeaders=host;x-amz-date,\n  Signature=${value}`;
    case 'SharedKey':
      return `Authorization: SharedKey acct:${value}`;
    default: {
      const unknown = form;
      throw new Error(`unknown form ${unknown}`);
    }
  }
}

const FUNCTIONS = [
  ['maskText', maskText],
  ['maskConsole', maskConsole],
  ['maskBody', maskBody],
  ['mask', (text) => mask('label', text)],
];

test('planted secret is absent for every sensitive key form, length, and position', () => {
  const started = performance.now();
  let count = 0;
  for (const form of FORMS) {
    for (const length of LENGTHS) {
      for (const position of POSITIONS) {
        const input = wrap(form, plant(length, position), length, position);
        count += 1;
        const needle = form === 'letters-only-folded' ? LETTER_SECRET : SECRET;
        for (const [name, fn] of FUNCTIONS) {
          const out = fn(input);
          assert.equal(out.includes(needle), false, `${form} len=${length} pos=${position} ${name}`);
        }
      }
    }
  }
  const ms = performance.now() - started;
  assert.equal(count, FORMS.length * LENGTHS.length * POSITIONS.length);
  assert.ok(ms < 2000, `property ${ms}`);
  console.log(`property cases ${count} ${ms.toFixed(3)}ms`);
});

function propertyInputs() {
  const inputs = [];
  for (const form of FORMS) {
    for (const length of LENGTHS) {
      for (const position of POSITIONS) inputs.push(wrap(form, plant(length, position), length, position));
    }
  }
  return inputs;
}

function formQuote(form) {
  if (form === 'single') return "'";
  if (form === 'backtick') return '`';
  if (form === 'double' || form === 'json' || form === 'nested' || form === 'array' || form === 'quoted+fold') return '"';
  return '';
}

function midDelimiterInputs() {
  const inputs = [];
  for (const delim of MID_DELIMS) {
    for (const form of FORMS) {
      for (const length of LENGTHS) {
        for (const position of POSITIONS) {
          const prefix = plant(length, position);
          const quote = formQuote(form);
          // A wrapper quote equal to the delimiter would close before S. Escape it so
          // prefix + delim + S stays inside that form's value.
          const value = quote && delim === quote ? `${prefix}\\${delim}${SECRET}` : `${prefix}${delim}${SECRET}`;
          inputs.push(wrap(form, value, length, position, value));
        }
      }
    }
  }
  return inputs;
}

test('mid-value-delimiter keeps the secret masked for every delim, form, length, and position', () => {
  const started = performance.now();
  const inputs = midDelimiterInputs();
  for (const input of inputs) {
    for (const [name, fn] of FUNCTIONS) {
      const out = fn(input);
      assert.equal(out.includes(SECRET), false, `${name} ${input.slice(0, 80)}`);
    }
  }
  const ms = performance.now() - started;
  assert.equal(inputs.length, MID_DELIMS.length * FORMS.length * LENGTHS.length * POSITIONS.length);
  assert.ok(ms < 2000, `property ${ms}`);
  console.log(`mid-value-delimiter ${inputs.length} ${ms.toFixed(3)}ms`);
});

test('maskText, maskConsole, and maskBody are idempotent on property inputs', () => {
  const inputs = propertyInputs().concat(midDelimiterInputs());
  const sample = [];
  for (let i = 0; i < inputs.length; i++) if (i % 7 === 0) sample.push(inputs[i]);
  assert.ok(sample.length >= 500, `sample ${sample.length}`);
  for (const input of sample) {
    for (const fn of [maskText, maskConsole, maskBody]) {
      const once = fn(input);
      assert.equal(fn(once), once);
    }
  }
  console.log(`property idempotence ${sample.length}`);
});
