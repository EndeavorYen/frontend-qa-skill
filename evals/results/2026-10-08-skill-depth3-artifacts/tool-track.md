# 工具軌

- 工具：chrome-cdp-ex `41f165e`
- repo：https://github.com/EndeavorYen/chrome-cdp-ex
- Chrome：HeadlessChrome/145.0.7632.6
- Node：v26.8.2
- OS：darwin 27.0.0

### T1 [bug] `click` 回報 Outcome: no-change，但送出已經成功並導到詳情頁

- 指令：`click 6B664D10 '#order button.btn-primary'`
- 預期：回報點擊造成畫面變化
- 實際：指令以錯誤結束，`Kind: click-no-change`、`Outcome: no-change`。同一時刻 netlog 有 `POST /api/orders` 201 與 `GET /api/orders/4` 200，網址變成 `/#/orders/4`，標題為「工單 #4」
- 替代方法：以 netlog 與 `location.hash` 確認送出成功，繼續測試
- 重現條件：建立訂單表單按「送出訂單」，成功後以 hash 路由換頁
- 影響：沒有擋住覆蓋地圖；後續送出改以網址與 netlog 確認
- 輸出節錄：`Error: click: the control did not react (Outcome: no-change). Clicked <BUTTON> "送出訂單"`
- 同一次執行裡的其他例子：頁尾 hash 連結按下去後網址已變、主內容已換成找不到頁面，`click` 仍回 `Outcome: no-change`。篩選按鈕按下去後 `aria-pressed` 已變成 `true`，`click` 仍回 no-change
- 狀態：使用者決定不報（只留草稿，不發出）

### T2 [摩擦] hash 換頁之後要另外看 netlog 或 `location.hash`，不能信 `click` 的 Outcome

- 情境：送出表單或按篩選後，要確認有沒有真的換頁或發出請求
- 目前做法：`click` 回 no-change 時，再跑 `netlog --type fetch` 和 `eval location.hash`
- 建議：`click` 在 hash 改變或出現寫入請求時不要回報 no-change；或提供 `--expect-request`
- 頻率：這次建立訂單、篩選、頁尾連結大約遇到 8 次
- 狀態：使用者決定不報（只留草稿，不發出）

## Issue 草稿

使用者要求只寫草稿，不要執行 `gh issue create` 或 `gh issue comment`。因此沒有搜尋既有 issue，也沒有發出。

### 草稿 1（對應 T1，新開）

**標題**：click: reports Outcome no-change after a hash route change

## 環境
- chrome-cdp-ex: 41f165e
- Chrome: HeadlessChrome/145.0.7632.6
- OS / Node: darwin 27.0.0 / v26.8.2

## 重現
1. 開一個用 `location.hash` 換頁的頁面，按鈕點擊後會改 hash，並可能發出一個 POST。
2. `cdp click <target> '<submit button>'`
3. 立刻讀 `location.hash` 與網路紀錄。

## 預期
hash 變了或寫入請求已發出時，`click` 回報畫面有變化。

## 實際
指令以錯誤結束：`Kind: click-no-change`、`Outcome: no-change`。同一時刻 hash 已經換成新路由，POST 也已經 201。篩選按鈕只改 `aria-pressed` 時也會這樣。

## 替代方法
用 `location.hash` 和 `netlog --type fetch` 確認結果，不要只看 `click` 的 Outcome。

## 背景
這是在使用 chrome-cdp-ex 進行前端品質驗證時發現的。

### 草稿 2（對應 T2，新開，摩擦）

**標題**：[proposal] click: include hash changes and write requests in the outcome

## 環境
- chrome-cdp-ex: 41f165e
- Chrome: HeadlessChrome/145.0.7632.6
- OS / Node: darwin 27.0.0 / v26.8.2

## 目前做法
`click` 之後再下 `netlog --type fetch`，並用 `eval` 讀 `location.hash`，才能知道送出有沒有發生。

## 建議
hash 改變或出現寫入請求時，`click` 不要回報 `Outcome: no-change`。也可以加一個類似 `--expect-request <url>` 的選項，把結果直接寫在回報裡。

## 背景
這是在使用 chrome-cdp-ex 進行前端品質驗證時發現的。同一輪大約要額外確認 8 次。
