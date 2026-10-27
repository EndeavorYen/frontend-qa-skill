# frontend-qa report：小訂單（seeded-app，本機）

- 環境檢查：已呼叫 `list_pages`，瀏覽器就緒。Chrome/156.0.0.0（裝 `scripts/mask.js` 後讀取）。驅動 chrome-devtools-mcp 1.2.0
- 目標：http://localhost:4173/（本機）。範圍：整個 app。帳號 qa；密碼由操作者在作業系統鍵盤層輸入，不在任何工具參數
- 禁止動作：預設（不刪真實資料、不付款、不寄信、不改帳號安全設定）。🗑 刪除只記錄存在，不按確認
- 深度 3（標準）；面項：新手、亂點、設計師、小螢幕鍵盤、惡劣環境、狀態、體檢（標準）、工具軌
- 視窗：1280×800、390×844。執行模式：單一 session（無人值守，不分 session）。入口：完整。Critic：無人值守，主 session 自查批次
- checkpoint：`{"name":"clean","url":"http://localhost:4173/#/orders","keys":["user"],"cookieNames":[],"counts":{"local":0,"session":1,"cookies":0}}`
- 探測：跳過。MCP server 自己開的 Chrome 走 `--remote-debugging-pipe`，沒有 `CDP_PORT`／`cdpPort`。改由測試輪用 MCP 工具做
- 估算（depth.md）：6 畫面 × 6 輪 + 體檢，約 150–200 次工具呼叫、約 20–30 分。無人值守，直接開始

## 結果

- 21 個 finding（F1–F21）：P1 4（F6、F8、F11、F19）、P2 13、P3 4。全部有截圖或 evaluate 紀錄，見 [findings.md](findings.md)
- P1 從乾淨狀態各重現 2 次，見 [critic-verdicts.md](critic-verdicts.md)；重現檔在 [repro/](repro/)（Playwright 沒裝，spec 沒跑）
- 體檢見 [ux-review.md](ux-review.md)；覆蓋見 [coverage.md](coverage.md)；工具軌見 [tool-track.md](tool-track.md)；未歸因：無
- 沒有測到：S3 詳情頁 API 失敗、登入 API 斷網
- 交付前已呼叫 `__frontendQaDeleteCheckpoints()`，回傳 `{"deleted":true}`
- 實際：約 170 次工具呼叫、約 12 分（runner 時鐘 09:57–10:09 UTC+8），低於估算
