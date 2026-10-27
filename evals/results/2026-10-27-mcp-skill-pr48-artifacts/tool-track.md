# tool-track

- 驅動：chrome-devtools-mcp 1.2.0（MCP 工具）；探測 `scripts/probe.mjs` 經 CDP port 9222
- T1 文件的 9222 設定要求 MCP server 帶 `--browser-url=http://127.0.0.1:9222`。這個環境的 MCP server 是既有連線，不能從 run 裡改參數，它仍用 `--remote-debugging-pipe` 自己開 Chrome。結果是兩個瀏覽器：探測在 9222 的專用設定檔、MCP 工具在 MCP 的設定檔。登入狀態、checkpoint 不共用。探測自己用 `login` 登入（隔離 context），所以不受影響
- T2 `probe.mjs` 對 `login.fill` 的 selector `main form input:not([type=password])` 印出「設定檔有明文密碼」警告；那一欄的值是帳號 `qa`，不是密碼。疑似用 selector 含 `password` 字樣判斷，誤報
- T3 第一次探測 `forms[].submit` 寫 `main form button[type=submit]`，按鈕沒有 `type` 屬性，三個送出類檢查都記 `probe-error`；偵察後改成 `main form button` 重跑，三項都有結果
- T4 重新登入（F14 深連結測試）後頁面整頁載入，`__frontendQaSaveCheckpoint` 不存在，回傳「helper missing」；重裝 checkpoint／mask 後再存。整輪重裝 mask 10 次、checkpoint 4 次；這次每個 `evaluate_script` 都在重裝後才跑，沒有因為腳本被清掉而失敗的呼叫
- T5 第一次離線送出的判斷用 `!!querySelector('.error')`，表單裡本來就有隱藏的 `.error`，結果誤判為有訊息；改成檢查可見後第 2 次正確。findings 用的是可見性結果
