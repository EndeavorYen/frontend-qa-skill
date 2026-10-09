# 工具軌

- chrome-cdp-ex：2.21.0（commit 未知，https://github.com/EndeavorYen/chrome-cdp-ex）
- Chrome：Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.0.0 Safari/537.36
- OS / Node：darwin / v26.8.2
- CDP：127.0.0.1:9444

### T1 [bug] `click` 在表單已經送出並換頁後，仍回報 Outcome: no-change

- 指令：`click 4C9402F5 form button`（建立訂單的「送出訂單」）
- 預期：導到新工單時回報 changed
- 實際：有幾次回報 `Kind: click-no-change`、`Outcome: no-change`，但接著的網址已是 `#/orders/5` 這類詳情，netlog 也有 POST 201
- 替代方法：不看 click 的 Outcome，改看 `location.hash` 和 netlog
- 重現條件：按「送出訂單」而且伺服器有建立訂單
- 影響：沒有把覆蓋地圖的格子標成阻擋。測試改看網址和請求
- 輸出節錄：`Error: click: the control did not react (Outcome: no-change). Clicked <BUTTON> "送出訂單"`

### T2 [摩擦] 登入頁用 `click button` 會點到畫面上看不到的「登出」

- 指令：`click 4C9402F5 button`
- 預期：點可見的「登入」
- 實際：回報點了 `<BUTTON> "登出"`，而且 `Outcome: no-change`。`perceive -i` 當時只列得出「登入」
- 替代方法：`click 4C9402F5 "form button"`
- 影響：沒有擋測試。登入改用表單按鈕

### T3 [摩擦] `nav` 在頁面已經 complete 時仍逾時

- 指令：`nav 4C9402F5 http://localhost:4173/#/login`
- 預期：導航結束就返回
- 實際：`Error: Timed out waiting for navigation to finish (last readyState: complete http://localhost:4173/#/login)`。網址其實已經到了
- 替代方法：逾時後用 `eval location.hash` 確認，不必重導
- 影響：沒有擋測試

### T4 [摩擦] `fill` 不能把欄位清空

- 指令：`fill input[name=user]` 接空字串
- 預期：清空帳號
- 實際：`Error: Text required`
- 替代方法：改填一個有內容的值，或用 `eval` 設 value。這次沒有把空字串送進登入
- 影響：空白送出改在建立訂單頁測（不填，直接按送出）

### T5 [bug] 探測腳本說建立訂單找不到 `button[type=submit]`

- 指令：`node scripts/probe.mjs` 的連點、離線送出、API 500 送出
- 預期：找得到「送出訂單」。這顆按鈕在畫面上是 `button[type=submit]`
- 實際：`probe-result.json` 有 3 筆 `probe-error`：「找不到按鈕：button[type=submit]」。同一頁用 chrome-cdp 的 `form button` 點得到
- 替代方法：測試輪改用 `form button` 自己做連點、斷網和 500
- 影響：探測沒有做成送出類檢查。覆蓋地圖 S4 的備註寫了這筆。這是探測腳本和頁面時機的問題，不是產品沒有按鈕

## Issue 草稿

尚未發出。等使用者逐筆同意。

1. 新開 issue：`click: 表單送出並換頁後仍回報 no-change`（T1）
2. 新開 issue：`click button 在登入頁點到不可見的登出`（T2）
3. 新開 issue：`[proposal] nav 在 readyState complete 時仍逾時`（T3）
4. 新開 issue：`[proposal] fill 拒絕空字串，無法清空欄位`（T4）
5. T5 不建議開到 chrome-cdp-ex。它是 frontend-qa 探測腳本的 selector 時機，不是瀏覽器驅動本身。標成不報，除非使用者要改記到 skill。
