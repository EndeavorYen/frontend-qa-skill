// frontend-qa anti-patterns
(() => {
  const visible = (e) => {
    if (!e.getClientRects().length) return false;
    const s = getComputedStyle(e);
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) !== 0;
  };
  const uniq = (list) => [...new Set(list)];
  const cs = (e) => getComputedStyle(e);
  const ownText = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  const clip = (s, n = 40) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const desc = (e) => {
    const id = e.id ? '#' + e.id : '';
    const cls = typeof e.className === 'string' && e.className.trim()
      ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    return e.tagName.toLowerCase() + id + cls;
  };
  const el = (e, extra = '') => desc(e) + ' "' + clip(ownText(e) || e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.value || '', 30) + '"' + (extra ? ' ' + extra : '');
  const parse = (c) => {
    const m = String(c).match(/[\d.]+/g);
    return m ? m.map(Number) : [0, 0, 0, 1];
  };
  const sat = (c) => {
    const [r, g, b] = parse(c);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
  };
  const light = (c) => {
    const [r, g, b] = parse(c);
    return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
  };
  const bgOf = (e) => {
    for (let n = e; n; n = n.parentElement) {
      const raw = cs(n).backgroundColor;
      const c = parse(raw);
      if (c.length < 4 || c[3] > 0.5) return raw;
    }
    return 'rgb(255, 255, 255)';
  };
  const filled = (e) => {
    const raw = cs(e).backgroundColor;
    const c = parse(raw);
    return (c.length < 4 || c[3] > 0.5) && sat(raw) > 0.15;
  };
  const charset = String(document.characterSet || '');
  const utf8 = /^utf-8$/i.test(charset);

  const buttons = [...document.querySelectorAll('button,a,[role=button]')].filter(visible);
  const multiplePrimaryButtons = [];
  const seenParents = new Set();
  for (const b of buttons) {
    const parent = b.parentElement;
    if (!parent || seenParents.has(parent)) continue;
    seenParents.add(parent);
    const sibs = [...parent.children].filter((e) => e.matches('button,a,[role=button]') && visible(e) && filled(e));
    const groups = new Map();
    for (const e of sibs) {
      const key = cs(e).backgroundColor + '|' + cs(e).color;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    for (const group of groups.values()) {
      if (group.length >= 2) multiplePrimaryButtons.push(group.map((e) => el(e)).join('；'));
    }
  }

  const placeholderAsLabel = [...document.querySelectorAll('input,textarea')].filter((e) => {
    if (!visible(e) || !e.getAttribute('placeholder')) return false;
    const type = (e.getAttribute('type') || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'file', 'image'].includes(type)) return false;
    if (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title')) return false;
    if (e.labels && e.labels.length) return false;
    if (e.closest('label')) return false;
    if (e.id && document.querySelector('label[for="' + CSS.escape(e.id) + '"]')) return false;
    return true;
  }).map((e) => el(e, 'placeholder="' + clip(e.getAttribute('placeholder'), 30) + '"'));

  const genericDialogActions = !utf8 ? [] : [...document.querySelectorAll('[role=dialog],dialog,[aria-modal=true]')].filter(visible).filter((d) => {
    const t = d.innerText || '';
    if (!/[?？]|嗎/.test(t)) return false;
    const names = [...d.querySelectorAll('button,[role=button],input[type=button],input[type=submit]')].filter(visible).map((b) => clip(b.innerText || b.value || '', 20));
    const generic = names.filter((name) => /^(確定|取消|OK|Cancel|Yes|No)$/i.test(name));
    const named = names.filter(Boolean);
    return generic.length >= 2 && generic.length === named.length;
  }).map((d) => el(d));

  const colorOnlyStatus = [];
  const parents = new Set([...document.querySelectorAll('body *')].map((e) => e.parentElement).filter(Boolean));
  for (const parent of parents) {
    const dots = [...parent.children].filter((e) => {
      if (!visible(e) || ownText(e) || (e.innerText || '').trim()) return false;
      if (e.querySelector('img,svg,button,a,input')) return false;
      if (e.getAttribute('aria-label') || e.getAttribute('title')) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.width <= 16 && r.height > 0 && r.height <= 16;
    });
    const colors = new Set(dots.map((e) => cs(e).backgroundColor));
    if (dots.length >= 2 && colors.size >= 2) colorOnlyStatus.push(dots.map((e) => el(e, cs(e).backgroundColor)).join('；'));
  }

  const grayOnColor = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!visible(e) || !ownText(e)) continue;
    const color = cs(e).color;
    const bg = bgOf(e);
    const L = light(color);
    if (sat(color) < 0.15 && L > 0.25 && L < 0.75 && sat(bg) > 0.35) grayOnColor.push(el(e, color + ' on ' + bg));
  }

  const skipCard = 'button,a,input,select,textarea,label,span,p,h1,h2,h3,h4,h5,h6,small,strong,em,th,td,li';
  const cardLike = (e) => {
    if (!visible(e) || e.matches(skipCard)) return false;
    const s = cs(e);
    if ((parseFloat(s.borderRadius) || 0) < 4) return false;
    const bg = parse(s.backgroundColor);
    if (bg.length >= 4 && bg[3] <= 0.5) return false;
    const shadow = s.boxShadow && s.boxShadow !== 'none';
    const border = ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(s['border' + side + 'Width']) > 0);
    if (!shadow && !border) return false;
    const r = e.getBoundingClientRect();
    if (r.width > innerWidth * 0.92 && r.height > innerHeight * 0.7) return false;
    return true;
  };
  const nestedCards = [...document.querySelectorAll('body *')].filter(cardLike).filter((e) => {
    let n = e.parentElement;
    for (let depth = 0; n && n !== document.body && depth < 8; depth += 1) {
      if (cardLike(n)) return true;
      n = n.parentElement;
    }
    return false;
  }).map((e) => el(e));

  const centeredLongText = [...document.querySelectorAll('p,div,li')].filter((e) => {
    if (!visible(e) || cs(e).textAlign !== 'center') return false;
    if (e.closest('button,a,h1,h2,h3,h4,th,label')) return false;
    return [...ownText(e)].length >= 40;
  }).map((e) => el(e));

  const EMPTY = /無資料|沒有資料|暫無資料|尚無資料|no data|nothing here|no results/i;
  const emptyStateNoAction = !utf8 ? [] : [...document.querySelectorAll('body *')].filter((e) => {
    if (!visible(e) || !EMPTY.test(ownText(e)) || !e.parentElement) return false;
    const blob = (e.parentElement.innerText || '').replace(/\s+/g, ' ').trim();
    if ([...blob].length > 80) return false;
    return !e.parentElement.querySelector('a,button,[role=button]');
  }).map((e) => el(e));

  const VAGUE = /^(發生錯誤|發生了一些錯誤|錯誤|something went wrong|an error occurred|error)[。.!！]?$/i;
  const vagueError = !utf8 ? [] : [...document.querySelectorAll('body *')].filter((e) => visible(e) && VAGUE.test(ownText(e))).map((e) => el(e));

  const DESTR = /刪除|移除|作廢|delete|remove|destroy/i;
  const PRIMARY = /新增|建立|儲存|送出|確認|save|create|submit|add/i;
  const nameOf = (e) => clip(e.innerText || e.getAttribute('aria-label') || e.value || '', 20);
  const destructiveLooksPrimary = [];
  if (utf8) {
    for (const d of buttons.filter((e) => DESTR.test(nameOf(e)) && filled(e))) {
      const match = buttons.find((p) => PRIMARY.test(nameOf(p)) && filled(p) && cs(p).backgroundColor === cs(d).backgroundColor && cs(p).color === cs(d).color);
      if (match) destructiveLooksPrimary.push(el(d) + ' = ' + el(match));
    }
  }

  const cap = (list) => uniq(list).slice(0, 20);
  return {
    multiplePrimaryButtons: cap(multiplePrimaryButtons),
    placeholderAsLabel: cap(placeholderAsLabel),
    genericDialogActions: cap(genericDialogActions),
    colorOnlyStatus: cap(colorOnlyStatus),
    grayOnColor: cap(grayOnColor),
    nestedCards: cap(nestedCards),
    centeredLongText: cap(centeredLongText),
    emptyStateNoAction: cap(emptyStateNoAction),
    vagueError: cap(vagueError),
    destructiveLooksPrimary: cap(destructiveLooksPrimary),
    warning: utf8 ? null : '頁面編碼是 ' + charset + '，不是 UTF-8。已略過文字比對：generic-dialog-actions、empty-state-no-action、vague-error、destructive-looks-primary',
  };
})()
