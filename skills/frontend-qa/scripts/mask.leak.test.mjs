import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import { mask, maskBody, maskConsole, maskText } from './mask.mjs';

const SECRET = 'abcd1234efgh';
const LETTER_SECRET = 'mysecretphrase';
const LENGTHS = [3, 20, 2000, 4095, 4096, 4097, 9000];
const POSITIONS = ['start', 'middle', 'end'];
const FORMS = ['header', 'single', 'double', 'backtick', 'json', 'nested', 'array', 'folded', 'lone-scheme-folded', 'letters-only-folded', 'no-key-scheme'];

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

function wrap(form, value, length, position) {
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
      return `Authorization: Bearer\n  ${plantLetters(length, position)}`;
    case 'no-key-scheme':
      return `Bearer\n  ${value}`;
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
