# frontend-qa report：小訂單（seeded-app，本機）

- 環境檢查：已呼叫 `list_pages`，瀏覽器就緒。Chrome/156.0.0.0（裝 `scripts/mask.js` 後讀取）。驅動 chrome-devtools-mcp 1.2.0
- 目標：http://localhost:4173/（本機）。範圍：整個 app。帳號 qa；密碼在作業系統鍵盤層輸入到已聚焦的密碼欄，不在任何工具參數
- 禁止動作：預設（不刪真實資料、不付款、不寄信、不改帳號安全設定）。🗑 刪除只開確認框，不按確認
- 深度 3（標準）；面項：新手、亂點、設計師、小螢幕鍵盤、惡劣環境、狀態、體檢（標準）、工具軌
- 視窗：1280×800、390×844。執行模式：單一 session（無人值守）。入口：完整。Critic：無人值守，主 session 自查批次
- checkpoint：`{"name":"clean","url":"http://localhost:4173/?run=pr48#/orders","keys":["user"],"cookieNames":[],"counts":{"local":0,"session":1,"cookies":0}}`
- 探測：有跑。Chrome 以 `--remote-debugging-port=9222 --user-data-dir=<專用設定檔目錄>` 啟動，`CDP_PORT=9222`（`probe.json` 也寫了 `cdpPort: 9222`），Node 22。MCP server 是既有的連線設定，沒有改成 `--browser-url=http://127.0.0.1:9222`，所以 MCP 工具操作的是 MCP 自己開的 Chrome，探測連的是 9222 那個 Chrome（見工具軌 T1）。密碼由 shell 在行程內產生後放進 `QA_PASSWORD`，沒出現在指令或設定檔
- 估算（depth.md）：6 畫面 × 6 輪 + 體檢，探測先跑，約 120–170 次工具呼叫、約 15–25 分。無人值守，直接開始

## 結果

- 22 個 finding（F1–F22）：P1 6（F6、F8、F11、F17、F19、F20）、P2 13、P3 3。全部有截圖、evaluate 或探測紀錄，見 [findings.md](findings.md)
- P1 從乾淨狀態各重現 2 次，見 [critic-verdicts.md](critic-verdicts.md)；重現檔在 [repro/](repro/)（Playwright 沒裝，spec 沒跑）
- 體檢見 [ux-review.md](ux-review.md)；覆蓋見 [coverage.md](coverage.md)；工具軌見 [tool-track.md](tool-track.md)；未歸因：無
- 沒有測到：S3 詳情頁 API 失敗、登入 API 斷網
- 交付前已呼叫 `__frontendQaDeleteCheckpoints()`，回傳 `{"deleted":true}`
- 實際：約 120 次工具呼叫（MCP 約 100，其中重裝 mask／checkpoint 14 次；探測 2 次），約 10 分（runner 時鐘 10:44–10:54 UTC+8），在估算內
