// 只修 B1：送出期間忽略第二次送出，並在成功或失敗後清掉旗標，讓之後的重試不會被丟掉。
// 用來驗證重現腳本「修好一個、只有那一份通過」。
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
