// 只修 B1：送出期間忽略第二次送出。用來驗證重現腳本「修好一個、只有那一份通過」。
export default {
  'app.js': [
    [
      "  form.addEventListener('submit', async (event) => {\n    event.preventDefault();\n    const data = Object.fromEntries(new FormData(form));",
      "  let busy = false;\n  form.addEventListener('submit', async (event) => {\n    event.preventDefault();\n    if (busy) return;\n    const data = Object.fromEntries(new FormData(form));",
    ],
    [
      "    document.getElementById('err').hidden = true;\n    const res = await fetch('/api/orders', {",
      "    document.getElementById('err').hidden = true;\n    busy = true;\n    const res = await fetch('/api/orders', {",
    ],
  ],
};
