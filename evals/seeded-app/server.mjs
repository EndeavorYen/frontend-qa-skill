import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./app/', import.meta.url));
const port = Number(process.env.PORT) || 4173;
// VARIANT=<名稱> 時，套用 variants/<名稱>.mjs 的字串替換（例如 settings-v2）
const variant = process.env.VARIANT
  ? (await import(new URL(`./variants/${process.env.VARIANT}.mjs`, import.meta.url))).default
  : {};
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

let nextId = 4;
const orders = [
  { id: 1, customer: '王小明', item: '機械鍵盤', qty: 1, price: 3200, status: 'pending', note: '請在週五前出貨' },
  { id: 2, customer: '陳美玲', item: '27 吋螢幕', qty: 2, price: 8900, status: 'done', note: '' },
  {
    id: 3,
    customer: 'Lin-Corporation-International-Trading-Company-Limited-Taiwan-Branch',
    item: 'USB-C 集線器',
    qty: 5,
    price: 1200,
    status: 'pending',
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

function send(res, code, body) {
  if (body === undefined) {
    res.writeHead(code);
    return res.end();
  }
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function api(req, res, pathname) {
  const match = pathname.match(/^\/api\/orders(?:\/(\d+))?$/);
  if (!match) return send(res, 404, { error: 'not found' });
  const id = match[1] && Number(match[1]);

  if (req.method === 'GET' && !id) {
    await sleep(300);
    return send(res, 200, orders);
  }
  if (req.method === 'GET') {
    const order = orders.find((o) => o.id === id);
    return order ? send(res, 200, order) : send(res, 404, { error: 'not found' });
  }
  if (req.method === 'POST' && !id) {
    const body = JSON.parse((await readBody(req)) || '{}');
    await sleep(800);
    const order = { ...body, id: nextId++, status: 'pending' };
    orders.push(order);
    return send(res, 201, order);
  }
  if (req.method === 'DELETE' && id) {
    const index = orders.findIndex((o) => o.id === id);
    if (index < 0) return send(res, 404, { error: 'not found' });
    orders.splice(index, 1);
    return send(res, 204);
  }
  send(res, 405, { error: 'method not allowed' });
}

async function serveStatic(res, pathname) {
  const file = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) return send(res, 403, { error: 'forbidden' });
  try {
    let content = await readFile(file);
    const edits = variant[file.slice(root.length).split(sep).join('/')];
    if (edits) {
      let text = content.toString('utf8');
      for (const [from, to] of edits) {
        if (!text.includes(from)) throw new Error(`variant ${process.env.VARIANT}: 找不到要替換的內容`);
        text = text.replace(from, to);
      }
      content = Buffer.from(text);
    }
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(content);
  } catch {
    send(res, 404, { error: 'not found' });
  }
}

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (pathname.startsWith('/api/')) await api(req, res, pathname);
      else await serveStatic(res, decodeURIComponent(pathname));
    } catch (error) {
      send(res, 500, { error: String(error) });
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`seeded-app: http://127.0.0.1:${port}${process.env.VARIANT ? ` (variant ${process.env.VARIANT})` : ''}`));
