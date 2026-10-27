import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { maskBody, maskConsole, maskText } from './mask.mjs';

const SURFACES = { maskText, maskConsole, maskBody };
const rows = readFileSync(new URL('./mask.regress.jsonl', import.meta.url), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));

function leaked(out, secret) {
  if (secret.length < 4) return out.includes(secret);
  for (let i = 0; i + 4 <= secret.length; i += 1) {
    if (out.includes(secret.slice(i, i + 4))) return true;
  }
  return false;
}

test('regress fixture hides every 4-char secret substring and is idempotent', () => {
  assert.equal(rows.length, 4620);
  let leaks = 0;
  for (const row of rows) {
    const fn = SURFACES[row.surface];
    assert.equal(typeof fn, 'function', row.surface);
    const out = fn(row.input);
    if (leaked(out, row.secret)) leaks += 1;
    assert.equal(fn(out), out);
  }
  assert.equal(leaks, 0);
  console.log(`regress ${rows.length}/${rows.length} leaks ${leaks}`);
});
