import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MASK_SOURCE, mask, maskConsole } from './mask.mjs';

const cases = JSON.parse(readFileSync(new URL('./mask.cases.json', import.meta.url), 'utf8'));
const maskSource = readFileSync(new URL('./mask.js', import.meta.url), 'utf8');
const KEY_SAMPLE = 'kept';
const TRUNCATE_AT = 2000;

test('mask.mjs loads the mask.js installer', () => {
  assert.equal(MASK_SOURCE, maskSource);
  assert.equal(typeof mask, 'function');
  assert.equal(typeof maskConsole, 'function');
});

function applyRow(row) {
  switch (row.kind) {
    case 'key':
      return mask(row.input, KEY_SAMPLE);
    case 'value':
      return mask('label', row.input);
    case 'console':
      return maskConsole(row.input);
    default: {
      const unknownKind = row.kind;
      throw new Error(`unknown kind ${unknownKind}`);
    }
  }
}

function assertMasked(row, out) {
  if (row.kind === 'key') {
    assert.equal(out, `<masked len=${KEY_SAMPLE.length}>`);
    return;
  }
  if (row.kind === 'value') {
    assert.equal(out, `<masked len=${row.input.length}>`);
    return;
  }
  if (row.kind !== 'console') {
    const unknownKind = row.kind;
    throw new Error(`unknown kind ${unknownKind}`);
  }
  assert.match(out, /<masked len=\d+>/);
  assert.notEqual(out, row.input);
  const bearerTokens = row.input.match(/\bBearer\s+([A-Za-z0-9+/=_.-]+)/gi) || [];
  for (const match of bearerTokens) {
    const token = match.replace(/^Bearer\s+/i, '');
    assert.equal(out.includes(token), false);
  }
  const jwts = row.input.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
  for (const jwt of jwts) assert.equal(out.includes(jwt), false);
  const urls = row.input.match(/https?:\/\/[^\s)]+/gi) || [];
  for (const url of urls) assert.equal(out.includes(url), true, url);
  const outsideUrls = row.input.replace(/https?:\/\/[^\s)]+/gi, ' ');
  const runs = outsideUrls.match(/[A-Za-z0-9+/=_-]{20,}/g) || [];
  for (const run of runs) {
    if (run.startsWith('/')) continue;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(run)) continue;
    if (!/[A-Za-z]/.test(run) || !/\d/.test(run)) continue;
    if (/^sku[-_]/i.test(run)) continue;
    if (/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+$/.test(run)) continue;
    assert.equal(out.includes(run), false, run);
  }
}

function assertClear(row, out) {
  if (row.kind === 'key') {
    assert.equal(out, KEY_SAMPLE);
    return;
  }
  if (row.input.length > TRUNCATE_AT) {
    const suffix = `…<truncated len=${row.input.length}>`;
    assert.equal(out, row.input.slice(0, TRUNCATE_AT) + suffix);
    assert.equal(out.endsWith(suffix), true);
    return;
  }
  assert.equal(out, row.input);
}

for (const row of cases) {
  const preview = row.input.length > 48 ? `${row.input.slice(0, 45)}...` : row.input;
  test(`mask.mjs ${row.kind} ${row.expect}: ${JSON.stringify(preview)}`, () => {
    const out = applyRow(row);
    if (row.expect === 'masked') {
      assertMasked(row, out);
      return;
    }
    if (row.expect === 'clear') {
      assertClear(row, out);
      return;
    }
    throw new Error(`unknown expect ${row.expect}`);
  });
}
