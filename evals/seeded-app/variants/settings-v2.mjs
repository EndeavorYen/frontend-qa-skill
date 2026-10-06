// 改動版：只改設定頁（S5），加上「語言」下拉，並埋入 B22（切到 English 後「儲存」被停用，切回中文也不會恢復）。
// 注入的程式碼不加註解，因為它會透過 HTTP 送到受測的 agent。
// 用來測跨次記憶的增量模式：第二次執行時只有這個畫面改了。見 ../ANSWER-KEY.md 的「改動版」。
export default {
  'app.js': [
    [
      '      <div class="actions"><button class="btn btn-primary">儲存</button></div>',
      '      <label class="field">語言<select name="lang"><option>中文</option><option>English</option></select></label>\n' +
        '      <div class="actions"><button class="btn btn-primary" id="save">儲存</button></div>',
    ],
    [
      "    toast('已儲存');\n  });\n}",
      "    toast('已儲存');\n  });\n" +
        "  document.querySelector('[name=lang]').addEventListener('change', (event) => {\n" +
        "    if (event.target.value === 'English') document.getElementById('save').disabled = true;\n" +
        "  });\n}",
    ],
  ],
};
