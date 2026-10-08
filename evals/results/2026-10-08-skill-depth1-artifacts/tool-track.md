# 工具軌

- chrome-cdp-ex: `41f165e`
- repo: https://github.com/EndeavorYen/chrome-cdp-ex
- Chrome: HeadlessChrome/145.0.7632.6
- OS / Node: darwin 27.0.0 / v26.8.2
- CDP_PORT: 56707

### T1 [bug] `click` 回報 Outcome: no-change，但送出已經完成或畫面已經變了

- 指令：`click <t> form#order button.btn-primary`；另一次是驗證失敗後同一顆按鈕
- 預期：有導頁或出現錯誤時，回報應反映畫面有變化
- 實際：回報 `Kind: click-no-change`、`Outcome: no-change`、exit 1。同一時間 DOM 已進到新訂單詳情（數量 0、小數、emoji 那幾次），或 `#err` 已顯示「發生錯誤」（只填空白客戶名稱那一次）
- 替代方法：接著用 `eval` 讀 `location.hash` 和訂單 API，確認資料已經寫入
- 重現條件：表單送出會改 hash，或只在頁面裡顯示一段原本隱藏的錯誤文字
- 影響：沒有把任何覆蓋格標成 ⛔。測試改讀 DOM 後繼續
- 去重：與已關閉的 [#487](https://github.com/EndeavorYen/chrome-cdp-ex/issues/487) 同一類（回報 no-change 但畫面有變）。[#589](https://github.com/EndeavorYen/chrome-cdp-ex/issues/589) 是頁面自己導頁後的下一次 click。這次仍出現在 `41f165e`
- 狀態：留言草稿，未發出

### T2 [bug] `nav` 在文件已經 complete 時仍逾時

- 指令：`nav <t> <url>`，目標頁在載入時把 hash 改到登入頁
- 預期：`readyState` 已是 complete 就視為導頁完成
- 實際：約 5 秒後 `Error: Timed out waiting for navigation to finish (last readyState: complete …)`，`Kind: timeout`。當時文件已經在登入頁
- 替代方法：忽略逾時，改 `eval` 讀 `location.hash`
- 重現條件：未登入時開啟需要登入的 hash，應用把網址改回登入頁。第一次打開登入頁時也發生過一次
- 影響：沒有把覆蓋格標成 ⛔
- 去重：搜尋 `nav timeout` 看到已關閉的 [#144](https://github.com/EndeavorYen/chrome-cdp-ex/issues/144)（當時是 `Page.navigate` 等約 15 秒）。這次訊息是 readyState 已經 complete 仍逾時，當作新問題
- 狀態：新 issue 草稿，未發出

### T3 [摩擦] `batch` 會把 selector 裡的逗號切掉

- 情境：一個 `batch` 步驟裡用逗號寫一組候選 selector
- 目前做法：`click button.login, form button, button` 被拆開，`querySelector` 收到 `button.login,`，`Kind: invalid-selector`
- 建議：引號內的逗號不要當成參數分隔；或在錯誤裡說明 batch 會切逗號
- 頻率：這次 1 次，改成單一 selector 後就過了
- 去重：`gh issue list --search "batch selector comma"` 沒有對上的 issue
- 狀態：新 issue 草稿，未發出

## Issue 草稿

未發出。這次指示只寫草稿，不執行 `gh issue create` 或 `gh issue comment`。

### 留言 [#487](https://github.com/EndeavorYen/chrome-cdp-ex/issues/487)（T1）

**標題**：click: receipt still says no-change when the click navigates or reveals text

## 環境
- chrome-cdp-ex: 41f165e
- Chrome: HeadlessChrome/145.0.7632.6
- OS / Node: darwin 27.0.0 / v26.8.2

## 重現
1. Open a page with a form whose submit handler changes the URL hash, or reveals a previously hidden error paragraph.
2. `click <t> form button`（the primary submit button）.

## 預期
The receipt says the page changed when the hash changed or the error text became visible.

## 實際
```
Error: click: the control did not react (Outcome: no-change). Clicked <BUTTON> "送出"
Kind: click-no-change
Outcome: no-change
```
Reading `location.hash` immediately afterwards shows the next route, or the hidden error node is now visible. Exit code is 1.

## 替代方法
Read `location.hash` or the error node's `hidden` flag with `eval` after the click.

## 背景
這是在使用 chrome-cdp-ex 進行前端品質驗證時發現的。#487 已關閉，但在 `41f165e` 仍會出現。相關：#589。

### 新 issue（T2）

**標題**：nav: times out even though readyState is already complete

## 環境
- chrome-cdp-ex: 41f165e
- Chrome: HeadlessChrome/145.0.7632.6
- OS / Node: darwin 27.0.0 / v26.8.2

## 重現
1. Serve a page that, while loading, sets `location.hash` to another hash on the same document (for example an auth gate).
2. `nav <t>` to the original URL.

## 預期
When `document.readyState` is `complete`, `nav` returns success.

## 實際
After about 5 seconds:
```
Error: Timed out waiting for navigation to finish (last readyState: complete)
Kind: timeout
```
The document is already on the redirected hash.

## 替代方法
Ignore the timeout and read `location.hash`.

## 背景
這是在使用 chrome-cdp-ex 進行前端品質驗證時發現的。已關閉的 #144 是另一種 `Page.navigate` 逾時。

### 新 issue（T3）

**標題**：[proposal] batch: keep commas inside a quoted selector

## 環境
- chrome-cdp-ex: 41f165e
- Chrome: HeadlessChrome/145.0.7632.6
- OS / Node: darwin 27.0.0 / v26.8.2

## 重現
1. `batch <t> 'click button.one, form button'`

## 目前做法
The comma is treated as an argument break. `querySelector` receives `button.one,` and fails with `Kind: invalid-selector`.

## 建議
Do not split on commas that are inside the selector token. If splitting is intentional, say so in the error.

## 背景
這是在使用 chrome-cdp-ex 進行前端品質驗證時發現的。

