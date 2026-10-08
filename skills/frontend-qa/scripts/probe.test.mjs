import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { anchorPresent, computeFingerprint } from './fingerprint.js';
import { buildProbeOutput, normalizePage, notePageLoad, plaintextPasswordFields, resolveEnvRefs } from './probe.mjs';

const script = fileURLToPath(new URL('./probe.mjs', import.meta.url));

function writeConfig(body) {
  const dir = mkdtempSync(join(tmpdir(), 'probe-'));
  const configPath = join(dir, 'probe.json');
  writeFileSync(configPath, JSON.stringify(body));
  return { dir, configPath, outPath: join(dir, 'probe-result.json') };
}

function runProbe(configPath, outPath, env) {
  return spawnSync(process.execPath, [script, configPath, '--out', outPath], {
    env,
    encoding: 'utf8',
  });
}

describe('resolveEnvRefs', () => {
  test('replaces an exact { env } field with the environment variable', () => {
    const { config, missing } = resolveEnvRefs(
      {
        base: 'http://localhost:3000',
        login: {
          url: '/#/login',
          fill: {
            '[name=email]': 'qa@example.com',
            '[name=password]': { env: 'QA_PASSWORD' },
          },
          submit: 'form button',
        },
        forms: [
          {
            url: '/#/projects/new',
            fill: { '[name=token]': { env: 'QA_TOKEN' } },
          },
        ],
      },
      { QA_PASSWORD: 'secret-value', QA_TOKEN: 'token-value' },
    );

    assert.deepEqual(missing, []);
    assert.equal(config.login.fill['[name=password]'], 'secret-value');
    assert.equal(config.login.fill['[name=email]'], 'qa@example.com');
    assert.equal(config.forms[0].fill['[name=token]'], 'token-value');
    assert.equal(config.login.url, '/#/login');
    assert.equal(config.login.submit, 'form button');
  });

  test('does not treat objects that have other keys as env refs', () => {
    const input = { login: { url: '/#/login', env: 'QA_PASSWORD' } };
    const { config, missing } = resolveEnvRefs(input, {});
    assert.deepEqual(missing, []);
    assert.deepEqual(config.login, input.login);
  });

  test('reports every missing variable and does not substitute an empty password', () => {
    const { config, missing } = resolveEnvRefs(
      {
        login: {
          fill: {
            '[name=password]': { env: 'QA_PASSWORD' },
            '[name=otp]': { env: 'QA_OTP' },
          },
        },
      },
      { QA_PASSWORD: '' },
    );

    assert.deepEqual(missing, ['QA_PASSWORD', 'QA_OTP']);
    assert.deepEqual(config.login.fill['[name=password]'], { env: 'QA_PASSWORD' });
    assert.notEqual(config.login.fill['[name=password]'], '');
  });
});

describe('plaintextPasswordFields', () => {
  test('names a string password field and ignores an env reference', () => {
    const fields = plaintextPasswordFields({
      login: { fill: { '[name=password]': 'plain-secret', '[name=email]': 'qa@example.com' } },
      forms: [{ fill: { '[name=password]': { env: 'QA_PASSWORD' } } }],
    });
    assert.deepEqual(fields, ['login.fill.[name=password]']);
  });
});

describe('probe-result fingerprints', () => {
  test('stores a page fingerprint and records a missing anchor', () => {
    const doc = {
      querySelectorAll() {
        return [];
      },
    };
    const fingerprint = computeFingerprint(doc);
    const page = normalizePage({ url: '/#/orders', anchor: 'h1:訂單列表' });
    const fingerprints = {};
    const results = [];
    notePageLoad({
      fingerprints,
      results,
      url: page.url,
      kind: 'page',
      anchor: page.anchor,
      fingerprint,
      anchorFound: anchorPresent(doc, page.anchor),
      viewport: '1440x900',
    });
    const out = buildProbeOutput({
      base: 'http://localhost:3000',
      startedAt: Date.now(),
      results,
      fingerprints,
    });

    assert.equal(out.probe, 'frontend-qa.probe.v1');
    assert.equal(out.fingerprints['/#/orders'].hash, fingerprint.hash);
    assert.deepEqual(out.fingerprints['/#/orders'].list, fingerprint.list);
    assert.equal(out.summary['anchor-missing'], 1);
    assert.equal(out.results[0].check, 'anchor-missing');
    assert.equal(out.results[0].url, '/#/orders');
    assert.match(out.results[0].detail, /h1:訂單列表/);
  });

  test('does not record anchor-missing when the anchor is present', () => {
    const page = normalizePage('/#/settings');
    assert.equal(page.url, '/#/settings');
    assert.equal(page.anchor, undefined);
    const fingerprints = {};
    const results = [];
    notePageLoad({
      fingerprints,
      results,
      url: '/#/orders/3',
      kind: 'record',
      fingerprint: { hash: 'abc', list: ['h1::詳情:'] },
      anchorFound: true,
      viewport: '1440x900',
    });
    const out = buildProbeOutput({
      base: 'http://localhost:3000',
      startedAt: Date.now(),
      results,
      fingerprints,
    });
    assert.deepEqual(out.fingerprints['/#/orders/3'], { hash: 'abc', list: ['h1::詳情:'] });
    assert.equal(out.results.length, 0);
    assert.equal(out.summary['anchor-missing'], undefined);
  });

  test('rejects a page entry that is neither a url nor { url, anchor }', () => {
    assert.throws(() => normalizePage({ anchor: 'h1:訂單列表' }), /url/);
  });
});

describe('probe.mjs CLI env stop', () => {
  test('stops before CDP when QA_PASSWORD is missing and names the variable', () => {
    const { configPath, outPath } = writeConfig({
      base: 'http://127.0.0.1:9',
      login: {
        url: '/#/login',
        fill: { '[name=password]': { env: 'QA_PASSWORD' } },
        submit: 'form button',
      },
    });
    const env = { ...process.env, CDP_PORT: '9' };
    delete env.QA_PASSWORD;
    const result = runProbe(configPath, outPath, env);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 2);
    assert.match(output, /QA_PASSWORD/);
    assert.equal(existsSync(outPath), false);
    assert.doesNotMatch(output, /連不上|probe-error|登入失敗/);
    assert.doesNotMatch(readFileSync(configPath, 'utf8'), /"password":\s*"/);
  });

  test('keeps the env reference on disk and does not print the resolved password', () => {
    const { configPath, outPath } = writeConfig({
      base: 'http://127.0.0.1:9',
      login: {
        url: '/#/login',
        fill: { '[name=password]': { env: 'QA_PASSWORD' } },
        submit: 'form button',
      },
    });
    const env = { ...process.env, CDP_PORT: '9', QA_PASSWORD: 'secret-value' };
    const result = runProbe(configPath, outPath, env);
    const output = `${result.stdout}\n${result.stderr}`;
    const saved = readFileSync(configPath, 'utf8');

    assert.match(saved, /"env":"QA_PASSWORD"/);
    assert.doesNotMatch(saved, /secret-value/);
    assert.doesNotMatch(output, /secret-value/);
    assert.doesNotMatch(output, /QA_PASSWORD 沒有設定/);
    assert.equal(existsSync(outPath), true);
    assert.doesNotMatch(readFileSync(outPath, 'utf8'), /secret-value/);
  });

  test('warns on stderr when a password field is still a plaintext string', () => {
    const secret = 'plain-secret-zz';
    const { configPath, outPath } = writeConfig({
      base: 'http://127.0.0.1:9',
      login: {
        url: '/#/login',
        fill: { '[name=password]': secret },
        submit: 'form button',
      },
    });
    const env = { ...process.env, CDP_PORT: '9' };
    delete env.QA_PASSWORD;
    const result = runProbe(configPath, outPath, env);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.match(result.stderr, /明文密碼/);
    assert.match(result.stderr, /\[name=password\]/);
    assert.doesNotMatch(output, new RegExp(secret));
    assert.doesNotMatch(readFileSync(outPath, 'utf8'), new RegExp(secret));
  });
});

describe('probe.mjs via a symlinked skill directory', () => {
  function linkedScript() {
    const dir = mkdtempSync(join(tmpdir(), 'probe-link-'));
    const link = join(dir, 'skill');
    symlinkSync(dirname(dirname(script)), link);
    return join(link, 'scripts', 'probe.mjs');
  }

  test('prints usage and exits 2 when run with no args', () => {
    const result = spawnSync(process.execPath, [linkedScript()], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage/);
    assert.equal(result.stdout, '');
  });

  test('stops before CDP when QA_PASSWORD is missing and names the variable', () => {
    const { configPath, outPath } = writeConfig({
      base: 'http://127.0.0.1:9',
      login: {
        url: '/#/login',
        fill: { '[name=password]': { env: 'QA_PASSWORD' } },
        submit: 'form button',
      },
    });
    const env = { ...process.env, CDP_PORT: '9' };
    delete env.QA_PASSWORD;
    const result = spawnSync(process.execPath, [linkedScript(), configPath, '--out', outPath], {
      env,
      encoding: 'utf8',
    });
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 2);
    assert.match(result.stderr, /QA_PASSWORD/);
    assert.equal(result.stdout, '');
    assert.equal(existsSync(outPath), false);
    assert.doesNotMatch(output, /連不上|probe-error|登入失敗/);
  });
});
