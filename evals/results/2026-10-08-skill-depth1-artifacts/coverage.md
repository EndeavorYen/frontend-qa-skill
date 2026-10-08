# 覆蓋地圖

| # | 畫面 / 流程步驟 | URL | 亂點 | 惡劣環境 | 體檢 | 備註 |
|---|---|---|---|---|---|---|
| S1 | 登入 | /#/login | ✅ | ✅ | ✅ | 探測：small-target。空白送出有「請輸入帳號與密碼」。離線仍可進列表，列表接著停在載入中（F2） |
| S2 | 訂單列表 | /#/orders | ✅ | ✅ | ✅ | 探測：small-target、not-keyboard-reachable、no-accessible-name、stuck-loading、console。慢速 3G 可載入。時鐘凍結後列表沒有時間文字 |
| S3 | 訂單詳情 | /#/orders/:id | ✅ | ✅ | ✅ | 探測：console-error（#3，F4）。詳情 API 500 顯示 undefined（F15） |
| S4 | 建立訂單 | /#/orders/new | ✅ | ✅ | ✅ | 探測：low-contrast、small-target、double-submit、no-feedback、no-error-message、超長輸入未橫向溢出 |
| S5 | 設定 | /#/settings | ✅ | ✅ | ✅ | 探測：small-target。儲存沒有 API 請求，離線與否結果相同（F14） |
| S6 | 說明 | /#/help | ✅ | ➖ 沒有資料請求，登入後就是固定的「找不到頁面」 | ✅ | 探測：small-target |
| S7 | 聯絡我們 | /#/contact | ✅ | ➖ 沒有資料請求，登入後就是固定的「找不到頁面」 | ✅ | 探測：small-target |
| P1 | 流程：登入 | /#/login → /#/orders | ✅ | ✅ | ➖ 流程列不做體檢 | 離線登入會進列表，然後停在載入中 |
| P2 | 流程：建立訂單 | /#/orders/new → /#/orders | ✅ | ✅ | ➖ 流程列不做體檢 | |
| P3 | 流程：查看訂單 | /#/orders → /#/orders/:id | ✅ | ✅ | ➖ 流程列不做體檢 | 抽樣 #1 待處理、#2 已完成且備註空字串、#3 沒有 note |
| P4 | 流程：刪除訂單 | /#/orders | ✅ | ✅ | ➖ 流程列不做體檢 | 刪了測試單 #10。API 500 時對話框關掉但列還在（F20） |
| P5 | 流程：儲存設定 | /#/settings | ✅ | ✅ | ➖ 流程列不做體檢 | |

## 既有資料抽樣
| 型態 | 抽樣 | console |
|---|---|---|
| 狀態：待處理 | #1 王小明 / 機械鍵盤 | #1 → 無 |
| 狀態：已完成 | #2 陳美玲 / 27 吋螢幕 | #2 → 無 |
| 狀態：已取消 | 沒有既有訂單；篩選後是空表（F11） | 不適用 |
| 選填欄位「備註」缺漏（API 沒有 note） | #3 | #3 → TypeError: Cannot read properties of undefined (reading 'trim')（F4） |
| 備註為空字串 | #2 note="" | #2 → 無；畫面顯示「（無備註）」 |
| 很長的客戶名稱 | #3 Lin-Corporation-International-Trading-Company-Limited-Taiwan-Branch | #3 → 見 F4；列表被截斷（F18） |
