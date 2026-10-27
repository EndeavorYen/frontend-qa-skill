# Findings

### F1 [P2][斷點] 頁尾「說明」「聯絡我們」都連到「找不到頁面」

- 畫面：全站頁尾（S1–S5 共用）
- 輪次：偵察／新手
- 視窗：1280x800
- 重現：
  1. 任一頁點頁尾「說明」→ `/#/help`
  2. 點頁尾「聯絡我們」→ `/#/contact`
- 預期：顯示說明或聯絡資訊
- 實際：兩個連結都只顯示「找不到頁面」，使用者遇到問題時找不到任何幫助
- 證據：`shots/F1-help-404.png`；`shots/F1-contact-404.png`
- 重現次數：1/1

### F2 [P2][文案] 建立訂單空白送出只顯示「發生錯誤」，修正後錯誤仍留著

- 畫面：S3 建立訂單（`/#/orders/new`）
- 輪次：新手
- 視窗：1280x800
- 重現：
  1. 以 qa 登入，前往 `/#/orders/new`
  2. 不填任何欄位，按「送出訂單」
  3. 再把各欄填好（客戶、品項、數量 2、單價 350）
- 預期：指出哪個欄位缺了、怎麼修；修好後錯誤消失
- 實際：只顯示「發生錯誤」，沒有欄位層級提示，必填欄位也沒有標示（input 都沒有 required）；填好之後「發生錯誤」仍在畫面上。沒有發出 POST（`list_network_requests` 只有 GET）
- 證據：`shots/F2-empty-submit.png`；`evaluate_script` 讀到可見文字「發生錯誤」
- 重現次數：1/1

### F3 [P3][文案] 詳情頁標題叫「工單 #n」，其他地方都叫「訂單」

- 畫面：S4 訂單詳情（`/#/orders/4`）
- 輪次：新手
- 實際：導覽、列表、建立頁都用「訂單」，詳情頁 h1 是「工單 #4」
- 證據：`shots/F3-workorder-heading.png`

### F4 [P2][邏輯] 設定按「儲存」沒有任何回饋，也沒有存下來

- 畫面：S5 設定（`/#/settings`）
- 輪次：新手
- 視窗：1280x800
- 重現：
  1. 前往 `/#/settings`
  2. 顯示名稱改成「QA 新手」、每頁筆數改 20、取消勾選 Email 通知
  3. 按「儲存」，再重新整理
- 預期：顯示已儲存，重新整理後仍是新值，頁首名稱跟著改
- 實際：按下後畫面沒有任何提示，沒有發出任何 API 請求（`list_network_requests`），頁首仍是 qa；重新整理後回到 qa / 10 / 勾選
- 證據：`shots/F4-settings-not-saved.png`；`list_network_requests` 沒有設定相關請求
- 重現次數：1/1

### F5 [P2][UX] 篩選「已取消」沒有資料時只剩表頭，沒有空狀態說明

- 畫面：S2 訂單列表（`/#/orders`）
- 輪次：新手
- 重現：列表點「已取消」
- 預期：說明「沒有已取消的訂單」並提供回到全部或建立訂單
- 實際：只剩表頭，沒有任何文字（違反 Nielsen 1 系統狀態可見）
- 證據：`shots/F5-cancelled-empty.png`
- 重現次數：1/1

### F6 [P2][bug] 篩選「已完成」仍列出全部訂單（含待處理）

- 畫面：S2 訂單列表（`/#/orders`）
- 輪次：新手
- 重現：
  1. 前往 `/#/orders`
  2. 點「已完成」
- 預期：只列出狀態為已完成的 #2
- 實際：「已完成」為 pressed，但列出 #1、#2、#3、#4 全部（#1、#3、#4 是待處理）；「待處理」篩選正常
- 證據：`shots/F6-done-filter.png`；`evaluate_script` 讀到 4 列
- 重現次數：1/1

### F7 [P1][bug] 數量填負數仍可建立訂單，小計變成負數

- 畫面：S3 建立訂單（`/#/orders/new`）
- 輪次：亂點
- 視窗：1280x800
- 重現：
  1. 以 qa 登入，前往 `/#/orders/new`
  2. 客戶「亂點負數」、品項「負數測試」、數量 `-3`、單價 `100`
  3. 按「送出訂單」
- 預期：擋下，提示「數量必須是正整數」（畫面上已有這行提示）
- 實際：表單即時小計顯示 `NT$ -300`；送出後建立了 #5，詳情與列表都是數量 -3、小計 NT$ -300。數量 0 會被擋（只顯示「發生錯誤」），負數卻會通過，驗證前後不一致
- 證據：`shots/F7-negative-qty.png`；POST `/api/orders` 201，詳情頁 `工單 #5 … 數量 -3 小計 NT$ -300`
- 重現次數：2/2（每次都先重啟 seeded server，從乾淨資料開始）
- 重播：`repro/F7.steps.md`（pass: false，detail: #6 qty -3，符合預期）
- 重現腳本：`repro/F7.spec.ts`（未執行：沒有 Playwright）

### F8 [P0][bug] 連點「送出訂單」會建立兩筆相同訂單

- 畫面：S3 建立訂單（`/#/orders/new`）
- 輪次：亂點
- 視窗：1280x800
- 重現：
  1. 以 qa 登入，前往 `/#/orders/new`
  2. 填好客戶、品項、數量 1、單價 10
  3. 在同一個 `evaluate_script` 對「送出訂單」呼叫兩次 `.click()`
- 預期：只送出一次（按鈕送出中應停用）
- 實際：`list_network_requests` 有兩筆 POST `/api/orders` 201（reqid 18、19），列表多出 #6、#7 兩筆內容相同的訂單
- 證據：`shots/F8-double-submit.png`；`list_network_requests` POST ×2
- 重現次數：2/2（每次都先重啟 seeded server，從乾淨資料開始）
- 重播：`repro/F8.steps.md`（pass: false，detail: 寫入請求 2 筆，符合預期）
- 重現腳本：`repro/F8.spec.ts`（未執行：沒有 Playwright）

### F9 [P2][UX] 選了篩選後重新整理，篩選跳回「全部」

- 畫面：S2 訂單列表（`/#/orders`）
- 輪次：亂點
- 重現：點「待處理」，然後重新整理
- 預期：保留「待處理」（篩選寫在網址或 storage）
- 實際：網址一直是 `/#/orders`，重新整理後 pressed 回到「全部」，列出 7 筆
- 證據：`shots/F9-filter-reset-reload.png`
- 重現次數：1/1

### F10 [P2][a11y] 刪除確認對話框按 Esc 關不掉，焦點也沒有移進對話框

- 畫面：S2 訂單列表（`/#/orders`）
- 輪次：亂點
- 重現：點任一列的 🗑 → 出現「刪除訂單 #n？」→ 按 Esc
- 預期：Esc 關閉對話框；開啟時焦點移到對話框內
- 實際：Esc 後對話框仍在（role=dialog、aria-modal=true）；`document.activeElement` 是 BODY
- 證據：`shots/F10-dialog-esc.png`
- 重現次數：1/1

### F11 [P2][UX] 建立訂單填到一半離開，沒有提示，回來後內容全部消失

- 畫面：S3 建立訂單（`/#/orders/new`）
- 輪次：亂點
- 重現：填客戶、品項、數量、單價 → 上一頁 → 下一頁
- 預期：離開前提示有未儲存內容，或回來時保留草稿
- 實際：沒有任何提示；回到建立頁時所有欄位都是空的
- 證據：`shots/F11-unsaved-lost.png`
- 重現次數：1/1

### F12 [P2][bug] 打開不存在的訂單顯示「工單 #undefined」「NT$ 非數值」

- 畫面：S4 訂單詳情（`/#/orders/999`）
- 輪次：亂點
- 重現：直接打開 `/#/orders/999`
- 預期：顯示「找不到這筆訂單」並提供回列表
- 實際：標題「工單 #undefined」、小計「NT$ 非數值」、狀態 `undefined`；console：`Failed to load resource: 404`、`Uncaught (in promise)`
- 證據：`shots/F12-order-999.png`；`list_console_messages` msgid 5、6
- 重現次數：1/1

### F13 [P2][a11y] 列表的刪除鈕 🗑 用鍵盤到不了，也沒有可讀名稱

- 畫面：S2 訂單列表
- 輪次：亂點、小螢幕鍵盤
- 重現：在列表上一直按 Tab
- 預期：每一列的刪除鈕都能聚焦，名稱類似「刪除訂單 #n」
- 實際：🗑 是一個 DIV（cursor:pointer），沒有 role、沒有 aria-label，tabIndex -1，大小約 19×23 px。Tab 順序依序是導覽、登出、建立訂單、篩選、#1–#6 連結、頁尾，完全跳過刪除鈕；snapshot 裡只看得到 StaticText
- 證據：`shots/F10-dialog-esc.png`（同一列）；evaluate_script 的焦點清單
- 重現次數：1/1

### F14 [P2][bug] 沒有備註的既有訂單打開會出 console 錯誤，備註欄空白

- 畫面：S4 訂單詳情（`/#/orders/3`）
- 輪次：狀態（抽樣既有資料：沒有備註的那筆）
- 重現：打開 `/#/orders/3`（API 回傳沒有 note 欄位）
- 預期：備註顯示「（無）」之類的字，不報錯
- 實際：console 出現 `Uncaught (in promise)`，堆疊在 renderDetail；備註欄是空字串。打開 `/#/orders/1` 時 console 沒有錯誤
- 證據：`shots/S4-desktop.png`；console msgid 7
- 重現次數：1/1

### F15 [P2][UI] 手機尺寸下，固定頁尾蓋住最後一列訂單

- 畫面：S2 訂單列表，390x844
- 輪次：小螢幕鍵盤
- 重現：手機尺寸打開列表，捲到最底
- 預期：最後一列完整可見、可點
- 實際：頁尾 position:fixed，高 120px（y 724–844）。捲到底（scrollY 68）時第 6 列仍有一部分在頁尾下面。表格外層有 overflow-x:auto，但小計、狀態、刪除三欄要橫向捲動才看得到，畫面上也沒有提示
- 證據：`shots/F15-footer-covers-row.png`
- 重現次數：1/1

### F16 [P3][UI] 超長客戶名稱在詳情頁超出卡片；手機上整頁被撐寬

- 畫面：S4 訂單詳情（`/#/orders/3`）
- 輪次：設計師、小螢幕鍵盤
- 實際：桌機上名稱溢出卡片右邊框（`shots/S4-desktop.png`）。手機 390 寬時 innerWidth 被撐到 536，整頁可以左右捲動。列表的名稱會被截斷但沒有 title，看不到全名
- 證據：`shots/S4-desktop.png`；evaluate_script 小螢幕檢查
- 重現次數：1/1

### F17 [P1][bug] 送出訂單時伺服器回 500，畫面跳到「找不到頁面」，輸入內容也沒了

- 畫面：S3 建立訂單
- 輪次：惡劣環境
- 重現：
  1. 用 evaluate_script 包住 fetch，讓 POST `/api/orders` 回 500
  2. 填好表單，按「送出訂單」
- 預期：留在表單，顯示「送出失敗，請重試」，保留輸入
- 實際：網址變成 `#/orders/undefined`，畫面只有「找不到頁面」，使用者以為送出成功或迷路，表單內容全部消失
- 證據：`shots/F17-submit-500.png`
- 重現次數：2/2（每次都先重啟 seeded server，從乾淨資料開始）
- 重播：`repro/F17.steps.md`（pass: false，detail: hash=#/orders/undefined，表單保留=false，符合預期）
- 重現腳本：`repro/F17.spec.ts`（未執行：沒有 Playwright）

### F18 [P2][UX] 離線時送出訂單沒有任何回饋

- 畫面：S3 建立訂單
- 輪次：惡劣環境
- 重現：讓 POST 以網路錯誤失敗，送出
- 預期：顯示網路錯誤
- 實際：畫面完全不動，沒有錯誤訊息；按鈕也沒有停用或載入狀態（Slow 3G 下送出時按鈕同樣沒有載入狀態）
- 證據：`shots/F18-offline-silent.png`
- 重現次數：1/1

### F19 [P2][UX] 列表 API 失敗（500 或 401）時永遠停在「載入中…」

- 畫面：S2 訂單列表
- 輪次：惡劣環境
- 重現：讓 GET `/api/orders` 回 500 或 401，然後進列表
- 預期：500 時顯示錯誤並提供重試；401 時導回登入
- 實際：兩種情況都卡在「載入中…」超過 5 秒，沒有錯誤也沒有導回登入（sessionStorage 仍有 user）。回空陣列時只剩表頭，同 F5
- 證據：`shots/F19-list-500-loading.png`
- 重現次數：1/1

### F20 [P3][UX]（Critic：證據不足，沒有截圖，不列入統計） 未登入時打開深連結，登入後沒有回到原本的頁面

- 畫面：S1 登入
- 輪次：狀態
- 重現：登出 → 打開 `/#/orders/2`（被導到登入）→ 登入
- 預期：回到 `/#/orders/2`
- 實際：回到 `/#/orders`
- 證據：evaluate_script 記錄的 hash
- 重現次數：1/1

### F21 [P3][一致性] 主要按鈕圓角 4px，次要按鈕 12px；表格裡的訂單編號是瀏覽器預設的藍色連結

- 畫面：全站
- 輪次：設計師
- 實際：`.btn-primary` 的 border-radius 是 4px，`.btn-secondary` 是 12px（刪除鈕 `.btn-danger` 4px），同一列並排時很明顯（建立表單的「取消」和「送出訂單」）。#1–#6 是 rgb(0,0,238) 加底線，跟其他文字的樣式不一致。登入錯誤 `<p class=error>` 沒有 role=alert
- 證據：`shots/S3-desktop.png`、`shots/S2-desktop.png`
- 重現次數：1/1

### F22 [P3][a11y] 「數量必須是正整數」提示對比只有 1.56:1

- 畫面：S3 建立訂單
- 輪次：設計師
- 實際：文字 rgb(200,200,200)，在白色背景上 13px，對比 1.56:1（AA 要求 4.5:1）
- 證據：`shots/S3-desktop.png`
- 重現次數：1/1
