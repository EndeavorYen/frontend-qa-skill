import assert from 'node:assert/strict';
import vm from 'node:vm';
import { describe, test } from 'node:test';
import { anchorPresent, browserAnchorExpression, browserFingerprintExpression, computeFingerprint } from './fingerprint.js';

const TEXT = 3;

function el(spec) {
  const attrs = { ...(spec.attrs || {}) };
  if (spec.href != null) attrs.href = spec.href;
  if (spec.type != null) attrs.type = spec.type;
  if (spec.role != null) attrs.role = spec.role;
  if (spec.aria != null) attrs['aria-label'] = spec.aria;
  const children = spec.children || [];
  const ownText = spec.ownText != null ? spec.ownText : spec.text || '';
  const node = {
    tagName: String(spec.tag).toUpperCase(),
    name: spec.name || '',
    placeholder: spec.placeholder || '',
    innerText: spec.innerText != null ? spec.innerText : [ownText, ...children.map((child) => child.innerText || '')].join(''),
    childNodes: [{ nodeType: TEXT, textContent: ownText }, ...children],
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    getClientRects() {
      return spec.visible === false ? [] : [{}];
    },
    matches(selector) {
      return matches(node, selector);
    },
  };
  return node;
}

function matches(node, selector) {
  return selector.split(',').some((part) => matchesOne(node, part.trim()));
}

function matchesOne(node, selector) {
  const tagMatch = selector.match(/^[a-zA-Z0-9-]*/);
  const tag = tagMatch ? tagMatch[0] : '';
  const rest = selector.slice(tag.length);
  if (tag && node.tagName.toLowerCase() !== tag.toLowerCase()) return false;
  const attrs = [...rest.matchAll(/\[([^\]=]+)(?:=(?:"([^"]*)"|([^\]]+)))?\]/g)];
  if (!tag && attrs.length === 0) return false;
  for (const [, name, quoted, bare] of attrs) {
    const actual = node.getAttribute(name);
    const expected = quoted != null ? quoted : bare;
    if (expected == null) {
      if (actual == null) return false;
    } else if (actual !== expected) return false;
  }
  return true;
}

function createDocument(elements) {
  return {
    querySelectorAll(selector) {
      return elements.filter((node) => matches(node, selector));
    },
  };
}

function djb2(list) {
  let hash = 5381;
  for (const char of list.join('|')) hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  return hash.toString(16);
}

function screen(extra = []) {
  return createDocument([
    el({ tag: 'h1', text: '訂單列表' }),
    el({ tag: 'a', href: '/#/orders/12', text: 'Acme 公司' }),
    el({ tag: 'button', text: '新增訂單' }),
    el({ tag: 'input', type: 'search', placeholder: '搜尋' }),
    ...extra,
  ]);
}

describe('computeFingerprint', () => {
  test('hashes the sorted unique part list with djb2', () => {
    const fingerprint = computeFingerprint(screen());
    assert.equal(fingerprint.hash, djb2(fingerprint.list));
    assert.deepEqual(fingerprint.list, [...fingerprint.list].sort());
    assert.equal(new Set(fingerprint.list).size, fingerprint.list.length);
  });

  test('ignores link text, record ids, uuids, and slugs', () => {
    const first = computeFingerprint(screen());
    const second = computeFingerprint(createDocument([
      el({ tag: 'h1', text: '訂單列表' }),
      el({ tag: 'a', href: '/#/orders/40', text: '別的客戶' }),
      el({ tag: 'a', href: '/files/550e8400-e29b-41d4-a716-446655440000', text: '附件' }),
      el({ tag: 'a', href: '/#/order-history', text: '歷史' }),
      el({ tag: 'button', text: '新增訂單' }),
      el({ tag: 'input', type: 'search', placeholder: '搜尋' }),
    ]));
    assert.equal(first.hash, computeFingerprint(screen()).hash);
    assert.ok(first.list.some((part) => part.includes('/#/orders/:id')));
    assert.notEqual(first.hash, second.hash);
    assert.ok(second.list.some((part) => part.includes('/files/:id')));
    assert.ok(second.list.some((part) => part.includes('/#/:id')));
    assert.equal(second.list.filter((part) => part.startsWith('a:')).every((part) => !part.includes('Acme') && !part.includes('客戶')), true);
  });

  test('replaces digits in control text and collapses duplicates', () => {
    const fingerprint = computeFingerprint(createDocument([
      el({ tag: 'button', text: '第 12 筆' }),
      el({ tag: 'button', text: '第 3 筆' }),
    ]));
    assert.deepEqual(fingerprint.list, ['button::第 # 筆:']);
  });

  test('uses a label\'s own text and a select\'s name, not option text', () => {
    const select = el({
      tag: 'select',
      aria: '語言',
      innerText: '中文 English',
      children: [el({ tag: 'option', text: '中文' })],
    });
    const fingerprint = computeFingerprint(createDocument([
      el({ tag: 'label', ownText: '語言', innerText: '語言 中文 English', children: [select] }),
      select,
      el({ tag: 'select', name: 'status', innerText: '草稿 已發佈' }),
    ]));
    assert.ok(fingerprint.list.includes('label::語言:'));
    assert.equal(fingerprint.list.some((part) => part.includes('中文') || part.includes('English') || part.includes('草稿')), false);
    assert.ok(fingerprint.list.includes('select::語言:'));
    assert.ok(fingerprint.list.includes('select::status:'));
  });

  test('skips elements with no client rects and changes when a heading changes', () => {
    const hidden = computeFingerprint(createDocument([
      el({ tag: 'h1', text: '訂單列表' }),
      el({ tag: 'button', text: '秘密', visible: false }),
    ]));
    const renamed = computeFingerprint(createDocument([
      el({ tag: 'h1', text: '設定' }),
    ]));
    assert.deepEqual(hidden.list, ['h1::訂單列表:']);
    assert.notEqual(hidden.hash, renamed.hash);
    assert.deepEqual(renamed.list, ['h1::設定:']);
  });

  test('browser expression matches computeFingerprint', () => {
    const doc = screen();
    const evaluated = vm.runInNewContext(browserFingerprintExpression(), { document: doc });
    const expected = computeFingerprint(doc);
    // vm arrays use another realm, so compare copied values.
    assert.equal(evaluated.hash, expected.hash);
    assert.deepEqual([...evaluated.list], expected.list);
  });
});

describe('anchorPresent', () => {
  test('matches a visible tag and exact text', () => {
    const doc = createDocument([
      el({ tag: 'h1', text: '訂單列表' }),
      el({ tag: 'h1', text: '設定', visible: false }),
    ]);
    assert.equal(anchorPresent(doc, 'h1:訂單列表'), true);
    assert.equal(anchorPresent(doc, 'h1:設定'), false);
    assert.equal(anchorPresent(doc, 'h1:不存在'), false);
    assert.equal(vm.runInNewContext(browserAnchorExpression('h1:訂單列表'), { document: doc }), true);
    assert.equal(vm.runInNewContext(browserAnchorExpression('h1:不存在'), { document: doc }), false);
  });
});
