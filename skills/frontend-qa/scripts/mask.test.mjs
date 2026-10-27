import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { after, test } from 'node:test';
import {
  MASK_SOURCE,
  READABLE_HEADERS,
  isSensitiveKey,
  mask,
  maskBody,
  maskConsole,
  maskEvaluateResult,
  maskResult,
  maskText,
} from './mask.mjs';

const cases = JSON.parse(readFileSync(new URL('./mask.cases.json', import.meta.url), 'utf8'));
// Vendor fixtures are stored with a § break so the file has no contiguous key.
// Stripping it restores the spec input before any assertion.
const SPEC_BREAK = '§';
function unbreak(value) {
  if (typeof value === 'string') return value.replaceAll(SPEC_BREAK, '');
  if (Array.isArray(value)) return value.map(unbreak);
  return value;
}
for (const row of cases) {
  row.input = unbreak(row.input);
  if (typeof row.output === 'string') row.output = unbreak(row.output);
  if (row.secrets) row.secrets = unbreak(row.secrets);
  if (row.keep) row.keep = unbreak(row.keep);
}
const maskSource = readFileSync(new URL('./mask.js', import.meta.url), 'utf8');
const KEY_SAMPLE = 'kept';
const WALKER_SECRET = 'abcd1234efgh';
const TRUNCATE_AT = 2000;
const GROUP_ORDER = ['old70', 'L', 'O', 'six', 'LH', 'F1', 'F2', 'V', 'E1', 'I1', 'K', 'KA', 'OBJ', 'CK', 'A1', 'F5', 'R3', 'R3c', 'R52', 'P1'];
const ALLOWED_DIFF = [174, 216];
const baseline = JSON.parse(readFileSync(new URL('./mask.baseline.json', import.meta.url), 'utf8'));
const groupStats = new Map();

test('mask.mjs loads the mask.js installer', () => {
  assert.equal(MASK_SOURCE, maskSource);
  assert.equal(typeof mask, 'function');
  assert.equal(typeof maskConsole, 'function');
  assert.equal(typeof maskText, 'function');
  assert.equal(typeof maskBody, 'function');
  assert.equal(typeof isSensitiveKey, 'function');
});

test('readable header list is exactly the closed list', () => {
  assert.deepEqual(Array.from(READABLE_HEADERS), [
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
});

function applyRow(row) {
  switch (row.kind) {
    case 'key':
      return mask(row.input, KEY_SAMPLE);
    case 'value':
      return mask(row.key ?? 'label', row.input);
    case 'console':
      return maskConsole(row.input);
    case 'text':
      return maskText(row.input);
    case 'body':
      return maskBody(row.input);
    case 'both':
      return [mask(row.key ?? 'label', row.input), maskConsole(row.input)];
    default: {
      const unknownKind = row.kind;
      throw new Error(`unknown kind ${unknownKind}`);
    }
  }
}

function assertOutput(row, out) {
  if (typeof row.output === 'string') {
    assert.equal(out, row.output);
    return true;
  }
  return false;
}

function assertSecrets(row, out) {
  assert.match(out, /<masked len=\d+>/);
  for (const secret of row.secrets) assert.equal(out.includes(secret), false, secret);
  for (const keep of row.keep || []) assert.equal(out.includes(keep), true, keep);
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
  if (row.kind !== 'console' && row.kind !== 'text' && row.kind !== 'both' && row.kind !== 'body') {
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

function assertSurfaces(row) {
  if (row.surfaces !== 'all') return;
  const outputs = [maskText(row.input), maskConsole(row.input), maskBody(row.input)];
  for (const got of outputs) {
    for (const secret of row.secrets || []) assert.equal(got.includes(secret), false, secret);
    for (const keep of row.keep || []) assert.equal(got.includes(keep), true, keep);
  }
}

function assertRow(row, out) {
  if (assertOutput(row, out)) {
    if (row.secrets) assertSecrets(row, out);
    assertSurfaces(row);
    return;
  }
  if (row.secrets && row.expect === 'masked') {
    assertSecrets(row, out);
    assertSurfaces(row);
    return;
  }
  if (row.expect === 'masked') {
    assertMasked(row, out);
    assertSurfaces(row);
    return;
  }
  if (row.expect === 'clear') {
    assertClear(row, out);
    assertSurfaces(row);
    return;
  }
  throw new Error(`unknown expect ${row.expect}`);
}

function tally(group, fn) {
  const stat = groupStats.get(group) ?? { pass: 0, total: 0 };
  groupStats.set(group, stat);
  stat.total += 1;
  try {
    fn();
    stat.pass += 1;
    return null;
  } catch (err) {
    return err;
  }
}

for (const row of cases) {
  const preview = row.input.length > 48 ? `${row.input.slice(0, 45)}...` : row.input;
  const group = row.group || 'old70';
  test(`mask.mjs ${row.kind} ${row.expect}: ${JSON.stringify(preview)}`, () => {
    const outputs = row.kind === 'both' ? applyRow(row) : [applyRow(row)];
    const errors = [];
    for (const out of outputs) {
      const err = tally(group, () => assertRow(row, out));
      if (err) errors.push(err);
    }
    if (errors.length) throw errors[0];
  });
}

test('maskResult and maskEvaluateResult hide every leaf under a sensitive key', () => {
  assert.deepEqual(
    maskResult({ credentials: { user: 'qa', pass: 'x1' }, otp: [123456, 'abc'], name: 'ok', n: 5 }),
    {
      credentials: { user: '<masked len=2>', pass: '<masked len=2>' },
      otp: ['<masked len=6>', '<masked len=3>'],
      name: 'ok',
      n: 5,
    },
  );
  assert.deepEqual(
    maskEvaluateResult({ value: { session: { id: 5 }, title: 'Hello' } }),
    { session: { id: '<masked len=1>' }, title: 'Hello' },
  );
});

test('maskResult keeps a Date as ISO and emits [Circular] for a repeated object', () => {
  const self = { a: 1 };
  self.self = self;
  assert.deepEqual(maskResult(self), { a: 1, self: '[Circular]' });
  assert.deepEqual(maskResult({ when: new Date(0) }), { when: '1970-01-01T00:00:00.000Z' });
  assert.deepEqual(maskResult({ password: new Date(0) }), { password: '<masked len=24>' });
});

test('maskResult and maskEvaluateResult share cycle and Date handling', () => {
  const a = {};
  a.value = a;
  assert.deepEqual(maskEvaluateResult({ value: a }), { value: '[Circular]' });
  assert.equal(maskEvaluateResult({ value: new Date(0) }), '1970-01-01T00:00:00.000Z');
  assert.equal(maskEvaluateResult({ value: new Date(NaN) }), 'Invalid Date');
  assert.deepEqual(
    maskEvaluateResult({ value: { password: new Date(0) } }),
    { password: '<masked len=24>' },
  );
  assert.deepEqual(
    maskEvaluateResult({ value: { password: new Date(NaN) } }),
    { password: '<masked len=12>' },
  );
  assert.equal(maskResult(new Date(NaN)), 'Invalid Date');
  assert.deepEqual(maskResult({ password: new Date(NaN) }), { password: '<masked len=12>' });
  const shared = { n: 1 };
  assert.deepEqual(maskResult({ a: shared, b: shared }), { a: { n: 1 }, b: { n: 1 } });
  assert.deepEqual(
    maskEvaluateResult({ value: { a: shared, b: shared } }),
    { a: { n: 1 }, b: { n: 1 } },
  );
});

function walkerInputs() {
  const cycle = { n: 'x' };
  cycle.self = cycle;
  const cycleArray = [1];
  cycleArray.push(cycleArray);
  const shared = { v: 1 };
  const sharedTwice = { a: shared, b: shared };
  const sharedMany = { v: 1 };
  const sharedThree = [sharedMany, [sharedMany], { k: sharedMany }];
  const nested = {};
  nested.a = { b: nested };
  return [
    ['cycle object', cycle],
    ['cycle array', cycleArray],
    ['shared object', sharedTwice],
    ['shared three paths', sharedThree],
    ['nested cycle', nested],
    ['date epoch', new Date(0)],
    ['date invalid', new Date(NaN)],
    ['date invalid nested', { d: [new Date(NaN)] }],
    ['password date', { password: new Date(0) }],
    ['password invalid date', { password: new Date(NaN) }],
    ['password leaves', { password: { a: WALKER_SECRET, n: 5, ok: true } }],
    ['auth note', { note: `Authorization: Token ${WALKER_SECRET}` }],
    ['bearer array', [`Bearer ${WALKER_SECRET}`]],
  ];
}

test('walker CASE outputs match the maskResult and maskEvaluateResult rows', () => {
  let n = 0;
  function expect(actual, expected) {
    n += 1;
    assert.deepEqual(actual, expected);
  }
  const inputs = new Map(walkerInputs());
  expect(maskResult(inputs.get('cycle object')), { n: 'x', self: '[Circular]' });
  expect(maskResult(inputs.get('cycle array')), [1, '[Circular]']);
  expect(maskResult(inputs.get('shared object')), { a: { v: 1 }, b: { v: 1 } });
  expect(maskResult(inputs.get('shared three paths')), [{ v: 1 }, [{ v: 1 }], { k: { v: 1 } }]);
  expect(maskResult(inputs.get('nested cycle')), { a: { b: '[Circular]' } });
  expect(maskResult(inputs.get('date epoch')), '1970-01-01T00:00:00.000Z');
  expect(maskResult(inputs.get('date invalid')), 'Invalid Date');
  expect(maskResult(inputs.get('date invalid nested')), { d: ['Invalid Date'] });
  expect(maskResult(inputs.get('password date')), { password: '<masked len=24>' });
  expect(maskResult(inputs.get('password invalid date')), { password: '<masked len=12>' });
  expect(maskResult(inputs.get('password leaves')), {
    password: { a: '<masked len=12>', n: '<masked len=1>', ok: '<masked len=4>' },
  });
  const note = JSON.stringify(maskResult(inputs.get('auth note')));
  const bearer = JSON.stringify(maskResult(inputs.get('bearer array')));
  n += 1;
  assert.equal(note.includes(WALKER_SECRET), false, note);
  n += 1;
  assert.equal(bearer.includes(WALKER_SECRET), false, bearer);
  expect(maskEvaluateResult(null), null);
  expect(maskEvaluateResult({ type: 'undefined' }), undefined);
  expect(maskEvaluateResult({ type: 'object', value: { token: WALKER_SECRET, d: new Date(0) } }), {
    token: '<masked len=12>',
    d: '1970-01-01T00:00:00.000Z',
  });
  expect(maskEvaluateResult({ value: inputs.get('cycle object') }), { n: 'x', self: '[Circular]' });
  assert.equal(n, 17);
  console.log(`walker cases ${n}`);
});

test('walker CASE inputs are unchanged', () => {
  const cycle = { n: 'x' };
  cycle.self = cycle;
  maskResult(cycle);
  assert.equal(cycle.self, cycle);
  assert.equal(cycle.n, 'x');

  const cycleArray = [1];
  cycleArray.push(cycleArray);
  maskResult(cycleArray);
  assert.equal(cycleArray[1], cycleArray);
  assert.equal(cycleArray[0], 1);
  assert.equal(cycleArray.length, 2);

  const shared = { v: 1 };
  const sharedTwice = { a: shared, b: shared };
  const sharedClone = structuredClone(sharedTwice);
  maskResult(sharedTwice);
  assert.deepEqual(sharedTwice, sharedClone);
  assert.equal(sharedTwice.a, shared);
  assert.equal(sharedTwice.b, shared);

  const sharedMany = { v: 1 };
  const sharedThree = [sharedMany, [sharedMany], { k: sharedMany }];
  const threeClone = structuredClone(sharedThree);
  maskResult(sharedThree);
  assert.deepEqual(sharedThree, threeClone);
  assert.equal(sharedThree[0], sharedMany);
  assert.equal(sharedThree[1][0], sharedMany);
  assert.equal(sharedThree[2].k, sharedMany);

  const nested = {};
  nested.a = { b: nested };
  maskResult(nested);
  assert.equal(nested.a.b, nested);

  const epoch = new Date(0);
  const epochClone = structuredClone(epoch);
  maskResult(epoch);
  assert.deepEqual(epoch, epochClone);

  const invalid = new Date(NaN);
  maskResult(invalid);
  assert.equal(Number.isNaN(invalid.getTime()), true);

  const nestedInvalid = new Date(NaN);
  const nestedInvalidRow = { d: [nestedInvalid] };
  maskResult(nestedInvalidRow);
  assert.equal(nestedInvalidRow.d[0], nestedInvalid);
  assert.equal(Number.isNaN(nestedInvalidRow.d[0].getTime()), true);

  const passwordDate = new Date(0);
  const passwordRow = { password: passwordDate };
  const passwordClone = structuredClone(passwordRow);
  maskResult(passwordRow);
  assert.deepEqual(passwordRow, passwordClone);
  assert.equal(passwordRow.password, passwordDate);

  const passwordInvalid = new Date(NaN);
  const passwordInvalidRow = { password: passwordInvalid };
  maskResult(passwordInvalidRow);
  assert.equal(passwordInvalidRow.password, passwordInvalid);
  assert.equal(Number.isNaN(passwordInvalidRow.password.getTime()), true);

  const leaves = { password: { a: WALKER_SECRET, n: 5, ok: true } };
  const leavesClone = structuredClone(leaves);
  maskResult(leaves);
  assert.deepEqual(leaves, leavesClone);

  const note = { note: `Authorization: Token ${WALKER_SECRET}` };
  const noteClone = structuredClone(note);
  maskResult(note);
  assert.deepEqual(note, noteClone);

  const bearer = [`Bearer ${WALKER_SECRET}`];
  const bearerClone = structuredClone(bearer);
  maskResult(bearer);
  assert.deepEqual(bearer, bearerClone);

  const remote = { type: 'object', value: { token: WALKER_SECRET, d: new Date(0) } };
  const remoteClone = structuredClone(remote);
  maskEvaluateResult(remote);
  assert.deepEqual(remote, remoteClone);
  const undefinedRemote = { type: 'undefined' };
  const undefinedClone = structuredClone(undefinedRemote);
  assert.equal(maskEvaluateResult(undefinedRemote), undefined);
  assert.deepEqual(undefinedRemote, undefinedClone);
  assert.equal(maskEvaluateResult(null), null);
});

test('walker CASE outputs are idempotent', () => {
  const rows = walkerInputs();
  for (const [name, input] of rows) {
    const once = maskResult(input);
    assert.deepEqual(maskResult(once), once, name);
  }
  console.log(`walker idempotence ${rows.length}`);
});

test('non-R52 rows match the c908bc0 baseline except ALLOWED_DIFF', () => {
  const allowed = new Set(ALLOWED_DIFF);
  const diffs = [];
  const unchanged = [];
  let seenR52 = false;
  for (let i = 0; i < cases.length; i++) {
    if (cases[i].group === 'R52') {
      seenR52 = true;
      continue;
    }
    assert.equal(seenR52, false, 'R52 rows are appended after the baseline rows');
    const old = baseline[i];
    const same = maskText(cases[i].input) === old.maskText
      && maskConsole(cases[i].input) === old.maskConsole
      && maskBody(cases[i].input) === old.maskBody;
    if (!same && !allowed.has(i)) diffs.push(i);
    if (same && allowed.has(i)) unchanged.push(i);
  }
  assert.deepEqual(diffs, []);
  assert.deepEqual(unchanged, []);
  assert.equal(baseline.length, cases.filter((row) => row.group !== 'R52').length);
});

test('maskText, maskConsole, and maskBody are idempotent on every row', () => {
  let n = 0;
  for (const row of cases) {
    for (const fn of [maskText, maskConsole, maskBody]) {
      const once = fn(row.input);
      assert.equal(fn(once), once);
    }
    n += 1;
  }
  console.log(`idempotence ${n}`);
});

function medianMs(samples) {
  const sorted = samples.slice().sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1];
}

test('P1 maskConsole and maskBody stay under 50ms at 20k chars', () => {
  const inputs = [
    '['.repeat(20000),
    '{'.repeat(20000),
    '{"a":'.repeat(4000),
    '"'.repeat(20000),
    'a=b&'.repeat(5000),
    'x:'.repeat(10000),
    `Authorization: Token ${'"'.repeat(20000)}`,
    `Authorization: Bearer${'\n  x'.repeat(5000)}`,
  ];
  const errors = [];
  for (const input of inputs) {
    const err = tally('P1', () => {
      const cutSamples = [];
      const uncutSamples = [];
      for (let run = 0; run < 5; run += 1) {
        const cutStart = performance.now();
        maskConsole(input);
        cutSamples.push(performance.now() - cutStart);
        const uncutStart = performance.now();
        maskBody(input);
        uncutSamples.push(performance.now() - uncutStart);
      }
      const cutMs = medianMs(cutSamples);
      const uncutMs = medianMs(uncutSamples);
      console.log(`P1 len=${input.length} cut median ${cutMs.toFixed(3)} uncut median ${uncutMs.toFixed(3)}`);
      assert.ok(cutMs < 50, `cut ${cutMs}`);
      assert.ok(uncutMs < 50, `uncut ${uncutMs}`);
    });
    if (err) errors.push(err);
  }
  if (errors.length) throw errors[0];
});

test('P1 walker stays under 50ms for a 20k shared array and a 1000-deep object', () => {
  const shared = { v: 1 };
  const wide = new Array(20000);
  for (let i = 0; i < wide.length; i += 1) wide[i] = shared;
  let deep = { leaf: 1 };
  for (let i = 0; i < 1000; i += 1) deep = { n: deep };
  const wideOut = maskResult(wide);
  assert.equal(wideOut.length, 20000);
  assert.equal(wideOut.includes('[Circular]'), false);
  assert.deepEqual(wideOut[0], { v: 1 });
  assert.deepEqual(wideOut[19999], { v: 1 });
  let cursor = maskResult(deep);
  for (let i = 0; i < 1000; i += 1) cursor = cursor.n;
  assert.deepEqual(cursor, { leaf: 1 });
  const wideSamples = [];
  const deepSamples = [];
  for (let run = 0; run < 5; run += 1) {
    const wideStart = performance.now();
    maskResult(wide);
    wideSamples.push(performance.now() - wideStart);
    const deepStart = performance.now();
    maskResult(deep);
    deepSamples.push(performance.now() - deepStart);
  }
  const wideMs = medianMs(wideSamples);
  const deepMs = medianMs(deepSamples);
  console.log(`P1 walker wide median ${wideMs.toFixed(3)} deep median ${deepMs.toFixed(3)}`);
  assert.ok(wideMs < 50, `wide ${wideMs}`);
  assert.ok(deepMs < 50, `deep ${deepMs}`);
});

after(() => {
  let pass = 0;
  let total = 0;
  for (const name of GROUP_ORDER) {
    const stat = groupStats.get(name) || { pass: 0, total: 0 };
    pass += stat.pass;
    total += stat.total;
    console.log(`${name} ${stat.pass}/${stat.total}`);
  }
  console.log(`table ${pass}/${total}`);
});
