# 工具軌（chrome-cdp-ex）

- 工具版本：chrome-cdp-ex 2bd2728（origin：https://github.com/EndeavorYen/chrome-cdp-ex.git）
- Chrome：HeadlessChrome/153.0.8010.12；Node v22.22.3；Linux 6.8
- 連線：CDP_PORT=9445（headless）

### T1 [bug] `nav` 對 SPA hash 重新導向的頁面回報逾時，但頁面其實已載入
- 指令：`nav <t> http://localhost:4174`（網站會在 client 端把網址改成 `#/login`）
- 預期：回報成功並印出最終網址
- 實際：`Error: Timed out waiting for navigation to finish (last readyState: complete http://localhost:4174/#/login)`，`Kind: timeout`，exit 1；但 readyState 已是 complete，之後 `perceive` 完全正常
- 替代方法：忽略錯誤，直接 `perceive`；之後改用 `eval "location.hash='#/…'"` 切換頁面
- 影響：1 次；需要判斷是否真的失敗才能繼續，容易誤判為頁面壞掉

### T2 [bug] `press Enter`（以及 `type $'\r'`）在 `<input>` 內不會觸發表單的 implicit submission，對已 focus 的 `<button>` 按 Enter 也不會觸發 click（`press Space` 可以）
- 指令：`click <t> "#ctla"` → `press <t> Enter`；對象是一個臨時注入、只有 `<input>` 與 `<button>` 的純 HTML 表單
- 預期：和真人按 Enter 一樣觸發 `submit` 事件
- 實際：`keydown` 事件有到（`Enter:false`），但沒有 `submit` 事件，頁面也沒有任何變化；回報「Pressed Enter.」像是成功
- 替代方法：用 `click` 點送出按鈕；或 `eval` 呼叫 `form.requestSubmit()`
- 影響：無法驗證「Enter 送出表單」的產品行為（S1、S4）；覆蓋地圖相關格註記，但改用替代方法繼續

### T3 [摩擦] 沒有「看 console／netlog 的某一輪新資料」之外的單一指令可以斷言「剛剛這個動作送出了幾次請求」
- 情境：驗證連點是否重複送出，每次都要 `netlog --clear` → `eval` 連點 → `sleep` → `netlog | grep`
- 建議：`eval` 或 `click` 加 `--expect-request <pattern>` 並列出請求數
- 頻率：本次約 6 次

## 去重結果（只讀搜尋，已用 `gh issue list -R EndeavorYen/chrome-cdp-ex --state all --search …`）

| 紀錄 | 搜尋結果 | 處置 |
|---|---|---|
| T1 `nav` 在 SPA hash 重新導向後逾時 | 搜尋「Timed out waiting for navigation」「hashchange redirect」「nav SPA redirect timeout」無相符 issue（#402 為 busy SPA 的 action receipt 逾時，現象不同） | 草稿：新開 issue |
| T2 `press Enter` 不觸發 implicit submission | #576 已存在且已 CLOSED（2026-10-06）。其環境欄位為 2bd2728 / HeadlessChrome 153 / Node 22.22.3，與本次相同；本次使用的 checkout 仍是 2bd2728，所以尚未包含修正 | 草稿：不新開；若 #576 的修正已 merge，只需更新本機 skill 後重驗；可留言補充「對已 focus 的 `<button>` 按 Enter 也不會 click」這一點（需先確認修正是否已涵蓋） |
| T3 缺少斷言請求次數的單一指令 | 搜尋 `expect-request` 找到 #220（verify-click 的 `--expect-status`）等相近 issue，沒有完全相同的提案 | 草稿：`[proposal]` 新開，或併入 #220 相關討論（由使用者決定） |

## Issue 草稿（未發出；等使用者逐筆同意）

### 草稿 A（新開）— T1

**標題**：nav: reports `Timed out waiting for navigation` when the SPA rewrites the URL hash right after load

## 環境
- chrome-cdp-ex: 2bd2728 (2.20.0)
- Chrome: HeadlessChrome/153.0.8010.12
- OS / Node: Linux 6.8 / Node v22.22.3

## 重現
1. 準備一個 hash-router 的單頁應用：載入 `/` 後，client 端立刻把網址改成 `/#/login`（`location.hash` 或 `history.replaceState`）。
2. `cdp nav <t> http://localhost:PORT/`

## 預期
回報成功，並印出最終網址 `…/#/login`。

## 實際
```
Error: Timed out waiting for navigation to finish (last readyState: complete http://localhost:PORT/#/login)
Kind: timeout
```
exit code 1。但訊息自己也顯示 `readyState: complete`，緊接著的 `perceive` 完全正常。

## 替代方法
忽略錯誤直接 `perceive`；之後用 `eval "location.hash='#/…'"` 切換頁面。

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的。錯誤很容易讓 agent 誤判成頁面載入失敗。

### 草稿 B（不新開，留言或不報）— T2
- 對象：既有 issue #576（已 CLOSED）
- 留言草稿：「在 2bd2728 上重現；補充：除了 `<input>` 內按 Enter 不會 submit，對已 focus 的 `<button>` 按 Enter 也沒有觸發 click，`press Space` 則正常。請確認修正是否也涵蓋 button 的 Enter 啟用。」
- 前置：先把本機 chrome-cdp-ex 更新到包含 #576 修正的版本再驗證，再決定是否真的留言。

### 草稿 C（`[proposal]`，新開或併入既有）— T3

**標題**：[proposal] click/eval: option to report how many requests the action sent

## 環境
- chrome-cdp-ex: 2bd2728 (2.20.0)
- Chrome: HeadlessChrome/153.0.8010.12
- OS / Node: Linux 6.8 / Node v22.22.3

## 目前做法
驗證「連點送出按鈕是否送出重複請求」時，每次都要：`netlog --clear` → `eval "b.click(); b.click()"` → `sleep` → `netlog --type xhr,fetch | grep POST`。

## 建議
`eval` / `click` 加上 `--expect-request <pattern>`（或 `--count-requests <pattern>`），在回報裡直接列出該動作期間符合的請求數與狀態碼。

## 頻率
這次 QA 約 6 次（連點建立訂單、連點刪除、篩選連點等）。

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的。

## 發出狀態
- T1：未發出（等使用者同意）
- T2：未發出；已有既有 issue #576
- T3：未發出（等使用者同意）
