// Fix B1 only: ignore a second submit while one is in flight, and clear the
// flag after success or failure so a later retry is not dropped.
export default {
  'app.js': [
    [
      "  form.addEventListener('submit', async (event) => {\n    event.preventDefault();\n    const data = Object.fromEntries(new FormData(form));",
      "  let busy = false;\n  form.addEventListener('submit', async (event) => {\n    event.preventDefault();\n    if (busy) return;\n    const data = Object.fromEntries(new FormData(form));",
    ],
    [
      "    document.getElementById('err').hidden = true;\n    const res = await fetch('/api/orders', {\n      method: 'POST',\n      headers: { 'content-type': 'application/json' },\n      body: JSON.stringify({\n        customer: data.customer.trim(),\n        item: data.item.trim(),\n        qty: Number(data.qty),\n        price: Number(data.price),\n        note: data.note,\n      }),\n    });\n    const order = await res.json();\n    location.hash = `#/orders/${order.id}`;",
      "    document.getElementById('err').hidden = true;\n    busy = true;\n    try {\n      const res = await fetch('/api/orders', {\n        method: 'POST',\n        headers: { 'content-type': 'application/json' },\n        body: JSON.stringify({\n          customer: data.customer.trim(),\n          item: data.item.trim(),\n          qty: Number(data.qty),\n          price: Number(data.price),\n          note: data.note,\n        }),\n      });\n      const order = await res.json();\n      location.hash = `#/orders/${order.id}`;\n    } finally {\n      busy = false;\n    }",
    ],
  ],
};
