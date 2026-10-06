# 工具軌

- chrome-cdp-ex: `a690a07`（`a690a07dcf2f9028af8aeb7f630649ce5d5cf38f`）
- repo: https://github.com/EndeavorYen/chrome-cdp-ex
- Chrome: 148.0.7778.96（HeadlessChrome/148.0.0.0）
- OS / Node: Linux 6.12.94+ / Node v22.14.0
- 連線：`CDP_PORT=9447`，`doctor` 成功

### T1 [bug] `nav` 到會被換成另一個 hash 的網址時逾時，但頁面其實已經完成

- 指令：`nav <t> http://localhost:4176/#/orders/1`（未登入）、以及已登入時 `nav <t> .../#/login`
- 預期：跟著最終網址結束，或在逾時前說明發生了用戶端轉址
- 實際：`Error: Timed out waiting for navigation to finish (last readyState: complete http://localhost:4176/#/login)`，`Kind: timeout`。接著讀 hash 已經是 `#/login`（或已登入時的 `#/orders`）。頁面可用
- 替代方法：忽略該次逾時，用 `eval location.hash` 與 `text` 確認落點，再繼續
- 重現條件：單頁應用在導覽完成前把 hash 改掉
- 影響：沒有讓覆蓋地圖停格。深層連結那一輪多等了一次逾時
- 輸出節錄：`Kind: timeout` / `Next: cdp status <t> (Kind: timeout)`

### T2 [bug] 固定頁尾擋住點擊時，`Next` 建議 `dismiss-modal`

- 指令：`click <t> button.btn-primary`（320x568，建立訂單捲到底）
- 預期：`Kind: covered` 指出頁尾，下一步是捲動、改視窗，或把頁尾當產品問題，而不是關對話框
- 實際：`Kind: covered` 本身是對的，擋住的是 `position:fixed footer`。`overlay` 的 `Next` 是 `cdp dismiss-modal <t>`。這頁沒有對話框，dismiss 幫不上
- 替代方法：用 `overlay` 讀到 footer 的矩形，再用座標確認按鈕和頁尾重叠，把問題記到產品軌（F10）
- 重現條件：固定頁尾蓋住按鈕，按鈕已在文件最底
- 影響：沒有停格。多看了一次不適用的 Next
- 輸出節錄：`blocked by [overlay] footer` / `Next: cdp dismiss-modal`

### T3 [摩擦] 長表現被 `perceive` 截斷，寬內容會讓 layout 寬度離開剛才設定的 viewport

- 情境：訂單超過約四列時，`perceive` 寫 `... more rows truncated`。詳情長名稱把 layout 撐到 536 時，`viewport` 回報 `390x844 (mobile mode); layout 536x1160`，`innerWidth` 是 536
- 目前做法：列數與儲存格用 `eval` 讀；寬度以 `eval innerWidth` 和工具回報的 layout 一起看
- 建議：截斷時給一條可以看其餘列的指令。layout 和請求的 viewport 不一致時，在 `viewport` 的一行結果裡直接標出來，不必等下一次 perceive
- 頻率：截斷在列表出現多次；layout 不一致在 `#/orders/3` 的 390 寬出現 2 次

### T4 [摩擦] 原生對話框預設自動接受

- 情境：`dialog` 回報 `Auto-accept: ON`，並且 `No dialogs recorded`
- 目前做法：這個應用的刪除確認是頁內對話框，不受影響。未儲存離開沒有看到原生對話框
- 建議：預設改成把 confirm 留在畫面上，或在 `doctor` 明白寫出目前是自動接受
- 頻率：這次 QA 查過 1 次

## Issue 草稿

未發出。這次是無人值守評測，草稿先留著，不開 issue。

搜尋：`gh issue list -R EndeavorYen/chrome-cdp-ex --state all --search "nav timeout"` 找到已關閉的 #144（`fix: nav times out waiting for Page.navigate`）。T1 是 hash 被頁面自己換掉之後的逾時，和 #144 的敘述接近但不確定是同一個原因，所以不併入、也不開新 issue。`overlay footer` 沒有找到既有 issue。

### 草稿 A（對應 T1，不報）

**標題**：nav: hash redirect times out even when readyState is already complete

## 環境
- chrome-cdp-ex: a690a07dcf2f9028af8aeb7f630649ce5d5cf38f
- Chrome: 148.0.7778.96
- OS / Node: Linux / v22.14.0

## 重現
1. 開一個會在載入後立刻把 hash 改成另一個路由的頁面
2. `nav <t> <original-hash-url>`

## 預期
指令跟著最終 URL 結束，或在逾時訊息裡寫出已經完成的 URL，而且不要等滿整段逾時

## 實際
`Error: Timed out waiting for navigation to finish (last readyState: complete <final url>)`
`Kind: timeout`

## 替代方法
逾時後讀 `location.hash`

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的。

### 草稿 B（對應 T2，不報）

**標題**：overlay: Next suggests dismiss-modal when the blocker is a fixed footer

## 環境
- chrome-cdp-ex: a690a07dcf2f9028af8aeb7f630649ce5d5cf38f
- Chrome: 148.0.7778.96
- OS / Node: Linux / v22.14.0

## 重現
1. 頁面底部有 `position: fixed` 的 footer，蓋住一顆按鈕
2. 捲到最底後 `click <t> <button>`
3. 讀 `overlay <t> <button>`

## 預期
`Kind: covered` 保留；`Next` 不要叫人 `dismiss-modal`

## 實際
`Next: cdp dismiss-modal <t>`，但畫面上沒有 dialog

## 替代方法
讀 overlay 矩形，把遮擋記成頁面問題

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的。

### 草稿 C（對應 T3，不報）`[proposal]`

**標題**：`[proposal]` perceive: tell the agent how to read truncated table rows

## 環境
- chrome-cdp-ex: a690a07
- Chrome: 148.0.7778.96
- OS / Node: Linux / v22.14.0

## 目前做法
`perceive` 在長表寫 `more rows truncated`，剩下的列改用 `eval` 讀文字

## 建議
截斷時附上可執行的下一步，例如只輸出其餘列的文字

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的。
