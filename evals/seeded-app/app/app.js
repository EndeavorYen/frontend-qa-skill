const $app = document.getElementById('app');
const $nav = document.getElementById('nav');

const STATUS = { pending: '待處理', done: '已完成', cancelled: '已取消' };
const FILTERS = {
  全部: () => true,
  待處理: (o) => o.status === 'pending',
  已完成: (o) => o.status !== 'cancelled',
  已取消: (o) => o.status === 'cancelled',
};
let filter = '全部';

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => `NT$ ${Number(n).toLocaleString('zh-TW')}`;

const routes = [
  [/^#\/login$/, renderLogin],
  [/^#\/orders$/, renderOrders],
  [/^#\/orders\/new$/, renderNewOrder],
  [/^#\/orders\/(\d+)$/, renderDetail],
  [/^#\/settings$/, renderSettings],
];

function route() {
  const hash = location.hash || '#/orders';
  const user = sessionStorage.getItem('user');
  $nav.hidden = !user;
  document.getElementById('who').textContent = user ?? '';
  if (!user && hash !== '#/login') {
    location.hash = '#/login';
    return;
  }
  if (user && hash === '#/login') {
    location.hash = '#/orders';
    return;
  }
  for (const [pattern, render] of routes) {
    const match = hash.match(pattern);
    if (match) return render(...match.slice(1));
  }
  $app.innerHTML = '<p>找不到頁面</p>';
}

function renderLogin() {
  $app.innerHTML = `
    <h1>登入</h1>
    <form id="login" class="narrow">
      <label class="field">帳號<input name="user" autocomplete="username" /></label>
      <label class="field">密碼<input name="password" type="password" autocomplete="current-password" /></label>
      <p class="error" id="err" hidden>請輸入帳號與密碼</p>
      <button class="btn btn-primary">登入</button>
    </form>`;
  document.getElementById('login').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const user = form.get('user').trim();
    if (!user || !form.get('password')) {
      document.getElementById('err').hidden = false;
      return;
    }
    sessionStorage.setItem('user', user);
    location.hash = '#/orders';
  });
}

async function renderOrders() {
  $app.innerHTML = `
    <div class="page-head"><h1>訂單</h1><a class="btn btn-primary" href="#/orders/new">建立訂單</a></div>
    <div class="filters">${Object.keys(FILTERS)
      .map((key) => `<button class="btn btn-secondary" data-filter="${key}" aria-pressed="${key === filter}">${key}</button>`)
      .join('')}</div>
    <div id="list"><p class="spinner">載入中…</p></div>`;
  $app.querySelector('.filters').addEventListener('click', (event) => {
    const key = event.target.dataset.filter;
    if (!key) return;
    filter = key;
    renderOrders();
  });

  const res = await fetch('/api/orders');
  const orders = await res.json();
  const rows = orders.filter(FILTERS[filter]);
  const $list = document.getElementById('list');
  $list.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>客戶</th><th>品項</th><th>數量</th><th>小計</th><th>狀態</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (o) => `<tr>
            <td><a href="#/orders/${o.id}">${o.id}</a></td>
            <td class="truncate">${esc(o.customer)}</td>
            <td>${esc(o.item)}</td>
            <td>${esc(o.qty)}</td>
            <td>${money(o.qty * o.price)}</td>
            <td>${STATUS[o.status]}</td>
            <td><div class="icon-btn" data-del="${o.id}">🗑</div></td>
          </tr>`,
        )
        .join('')}</tbody>
    </table></div>`;
  $list.addEventListener('click', (event) => {
    const id = event.target.dataset.del;
    if (id) confirmDelete(Number(id));
  });
}

function confirmDelete(id) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
      <h2 id="dlg-title">刪除訂單 #${id}？</h2>
      <p>刪除後無法復原。</p>
      <div class="actions">
        <button class="btn btn-secondary" data-act="cancel">取消</button>
        <button class="btn btn-danger" data-act="delete">刪除</button>
      </div>
    </div>`;
  backdrop.addEventListener('click', async (event) => {
    const act = event.target.dataset.act;
    if (act === 'cancel' || event.target === backdrop) backdrop.remove();
    if (act === 'delete') {
      await fetch(`/api/orders/${id}`, { method: 'DELETE' });
      backdrop.remove();
      renderOrders();
    }
  });
  document.body.append(backdrop);
}

function renderNewOrder() {
  $app.innerHTML = `
    <h1>建立訂單</h1>
    <form id="order" class="narrow" novalidate>
      <label class="field">客戶名稱<input name="customer" /></label>
      <label class="field">品項<input name="item" /></label>
      <label class="field">數量<input name="qty" type="number" /><span class="hint">數量必須是正整數</span></label>
      <label class="field">單價<input name="price" type="number" /></label>
      <label class="field">備註<textarea name="note" rows="3"></textarea></label>
      <p>小計：<strong id="subtotal">NT$ 0</strong></p>
      <p class="error" id="err" hidden>發生錯誤</p>
      <div class="actions">
        <a class="btn btn-secondary" href="#/orders">取消</a>
        <button class="btn btn-primary">送出訂單</button>
      </div>
    </form>`;
  const form = document.getElementById('order');
  form.addEventListener('input', () => {
    const data = new FormData(form);
    const subtotal = (Number(data.get('qty')) || 0) * (Number(data.get('price')) || 0);
    document.getElementById('subtotal').textContent = money(subtotal);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (!data.customer.trim() || !data.item.trim() || !data.qty || !data.price) {
      document.getElementById('err').hidden = false;
      return;
    }
    document.getElementById('err').hidden = true;
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customer: data.customer.trim(),
        item: data.item.trim(),
        qty: Number(data.qty),
        price: Number(data.price),
        note: data.note,
      }),
    });
    const order = await res.json();
    location.hash = `#/orders/${order.id}`;
  });
}

async function renderDetail(id) {
  $app.innerHTML = '<p class="spinner">載入中…</p>';
  const order = await (await fetch(`/api/orders/${id}`)).json();
  $app.innerHTML = `
    <p><a href="#/orders">← 回列表</a></p>
    <h1>工單 #${order.id}</h1>
    <div class="card"><dl>
      <dt>客戶</dt><dd>${esc(order.customer)}</dd>
      <dt>品項</dt><dd>${esc(order.item)}</dd>
      <dt>數量</dt><dd>${esc(order.qty)}</dd>
      <dt>小計</dt><dd>${money(order.qty * order.price)}</dd>
      <dt>狀態</dt><dd>${STATUS[order.status]}</dd>
      <dt>備註</dt><dd id="note"></dd>
    </dl></div>`;
  document.getElementById('note').textContent = order.note.trim() || '（無備註）';
}

function renderSettings() {
  $app.innerHTML = `
    <h1>設定</h1>
    <form id="settings" class="narrow">
      <label class="field">顯示名稱<input name="name" value="${esc(sessionStorage.getItem('user'))}" /></label>
      <label class="field">每頁筆數<select name="size"><option>10</option><option>20</option><option>50</option></select></label>
      <label class="check"><input type="checkbox" name="notify" checked /> 有新訂單時寄 Email 通知我</label>
      <div class="actions"><button class="btn btn-primary">儲存</button></div>
    </form>`;
  document.getElementById('settings').addEventListener('submit', (event) => {
    event.preventDefault();
    toast('已儲存');
  });
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 2000);
}

document.getElementById('logout').addEventListener('click', () => {
  sessionStorage.removeItem('user');
  location.hash = '#/login';
});

window.addEventListener('hashchange', route);
route();
