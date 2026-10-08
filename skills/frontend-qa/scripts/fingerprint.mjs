// Screen fingerprint shared by probe.mjs and the incremental-mode docs.
// The browser expression is this function's source, so the algorithm stays in one place.
// It returns { hash, list }. Link text, option text, and data-shaped URL segments are excluded.

export function computeFingerprint(doc) {
  const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
  const pattern = (href) => href.split('/').map((seg) => (/\d|^[0-9a-f]{8}-|^[a-z0-9]+(-[a-z0-9]+)+$/i.test(seg) ? ':id' : seg)).join('/');
  const name = (e) => {
    if (e.matches('a[href]')) return '';
    if (e.matches('label')) return own(e);
    if (e.matches('select')) return e.getAttribute('aria-label') || e.name || '';
    return e.getAttribute('aria-label') || e.innerText || e.placeholder || e.name || '';
  };
  const parts = [...doc.querySelectorAll('h1,h2,h3,label,button,a[href],input,select,textarea,[role=button],th,dt')]
    .filter((e) => e.getClientRects().length > 0)
    .map((e) => e.tagName.toLowerCase() + ':' + (e.getAttribute('type') || '') + ':' + name(e).trim().replace(/\s+/g, ' ').slice(0, 40).replace(/\d+/g, '#') + ':' + pattern(e.getAttribute('href') || ''));
  const list = [...new Set(parts)].sort();
  let h = 5381;
  for (const c of list.join('|')) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return { hash: h.toString(16), list };
}

export function browserFingerprintExpression() {
  return `((${computeFingerprint.toString()})(document))`;
}

// anchor is "tag:text", for example "h1:訂單列表". Text must match the visible element exactly.
export function anchorPresent(doc, anchor) {
  const sep = String(anchor).indexOf(':');
  if (sep <= 0) return false;
  const tag = anchor.slice(0, sep);
  const text = anchor.slice(sep + 1).trim().replace(/\s+/g, ' ');
  let nodes;
  try {
    nodes = doc.querySelectorAll(tag);
  } catch {
    return false;
  }
  for (const e of nodes) {
    if (!e.getClientRects || e.getClientRects().length === 0) continue;
    const raw = e.innerText != null ? e.innerText : e.textContent || '';
    if (String(raw).trim().replace(/\s+/g, ' ') === text) return true;
  }
  return false;
}

export function browserAnchorExpression(anchor) {
  return `((${anchorPresent.toString()})(document, ${JSON.stringify(anchor)}))`;
}
