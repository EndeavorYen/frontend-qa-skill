# 產品問題

Playwright 重現腳本已寫在 `repro/`。這台機器沒有安裝 Playwright（`npx --no-install playwright test` 因缺少套件而停止），所以 spec 未執行。重播檔 `repro/F1.actions.json` 到 `F8.actions.json` 已從乾淨狀態錄好。

### F1 [P1][RWD] 手機寬度下「送出訂單」被固定頁尾蓋住

- 畫面：S4 建立訂單（`/#/orders/new`）
- 輪次：小螢幕鍵盤
- 視窗：390x844（320x568 按鈕更在畫面外）
- 重現：
  1. 以 qa-user@example.com 登入，前往 `/#/orders/new`
  2. 把視窗設成 390x844，不要先捲動
  3. 取「送出訂單」按鈕中心做 `elementFromPoint`
- 預期：點到的是「送出訂單」
- 實際：頁尾 `footer` 是 `position:fixed`，從 y=724 蓋到畫面底（高 120px）。按鈕在 y=753–793，中心點命中的是頁尾。320x568 時按鈕的 y=753，視窗只有 568px 高，按鈕在畫面外，頁尾從 y=448 蓋住底部
- 證據：`shots/F1-footer-cover.png`；390 的命中元素是 `FOOTER`
- 重現次數：2/2
- 重播：`repro/F1.actions.json`
- 重現腳本：`repro/F1.spec.ts`

### F2 [P1][bug] 連點「送出訂單」會建立兩筆訂單

- 畫面：S4 建立訂單（`/#/orders/new`）
- 輪次：亂點
- 視窗：1440x900
- 重現：
  1. 登入後前往 `/#/orders/new`
  2. 填客戶 `QA-double`、品項 `dbl`、數量 `1`、單價 `10`
  3. 對 `form button` 在同一個回合呼叫兩次 `click()`
- 預期：只發出一個寫入請求，只建立一筆
- 實際：`POST /api/orders` 兩次，都是 201。列表出現兩筆「QA-double」（當時是 #8 與 #9）
- 證據：`shots/F2-duplicate-list.png`；netlog POST id 26 與 27
- 重現次數：2/2
- 重播：`repro/F2.actions.json`（連點的 `eval` 不在重播檔裡，複驗時要再跑一次同一個 `eval`）
- 重現腳本：`repro/F2.spec.ts`

### F3 [P1][邏輯] 畫面寫數量必須是正整數，負數、0、小數仍會建單

- 畫面：S4 建立訂單（`/#/orders/new`）
- 輪次：亂點
- 視窗：1440x900
- 重現：
  1. 前往 `/#/orders/new`
  2. 客戶與品項填任意文字，單價填 `100`，數量填 `-1`，按「送出訂單」
- 預期：停在表單，並說明數量必須是正整數，不建立訂單
- 實際：建立成功。工單 #4 數量 -1、小計 NT$ -100。同樣方式，數量 `0` 建立 #5（小計 NT$ 0），數量 `1.5` 建立 #6（小計 NT$ 75）。數量 `999999`、單價 `999999` 建立 #7，小計 NT$ 999,998,000,001
- 證據：`shots/F-neg-qty.png`；`POST /api/orders` 201，回應 `"qty":-1`
- 重現次數：2/2
- 重播：`repro/F3.actions.json`
- 重現腳本：`repro/F3.spec.ts`

### F4 [P1][邏輯] 設定按「儲存」沒有寫入，也沒有成功或失敗回饋

- 畫面：S5 設定（`/#/settings`）
- 輪次：狀態
- 視窗：1440x900
- 重現：
  1. 前往 `/#/settings`
  2. 把顯示名稱改成 `QA顯示名稱`，按「儲存」
  3. 看網路請求，再重新整理
- 預期：有寫入請求，畫面上看得到已儲存，重新整理後名稱還在
- 實際：按「儲存」之後沒有任何 xhr/fetch。畫面上沒有成功或錯誤文字。重新整理後顯示名稱回到 `qa-user@example.com`，每頁筆數回到 10
- 證據：`shots/F4-settings-no-feedback.png`
- 重現次數：2/2
- 重播：`repro/F4.actions.json`
- 重現腳本：`repro/F4.spec.ts`

### F5 [P1][斷點] 訂單列表在 API 失敗或斷網時一直停在「載入中」

- 畫面：S2 訂單列表（`/#/orders`）
- 輪次：惡劣環境
- 視窗：1440x900
- 重現：
  1. 登入後停在 `/#/orders`
  2. 把 `**/api/orders*` 回 500，然後重新整理（只改網址、沒有重新載入時，列表可能沿用舊資料）
  3. 等 5 秒。401 與斷網後重新進入，同樣停在載入中
- 預期：看得到錯誤說明和可以再試的方式
- 實際：5 秒後仍是「載入中…」，沒有錯誤文字。console 有 `TypeError: orders.filter is not a function`（500/401）或載入沒有完成（斷網）
- 證據：`shots/F-stuck-500.png`；`probe-result.json` 的 `stuck-loading` 兩筆
- 重現次數：2/2
- 重播：`repro/F5.actions.json`
- 重現腳本：`repro/F5.spec.ts`
- 相關：F6

### F6 [P1][斷點] 建立訂單時斷網，畫面上看不到錯誤

- 畫面：S4 建立訂單（`/#/orders/new`）
- 輪次：惡劣環境
- 視窗：1440x900
- 重現：
  1. 填好客戶、品項、數量 1、單價 2
  2. 斷網後按「送出訂單」，等 5 秒
- 預期：5 秒內看得到失敗、錯誤、無法、離線或請稍後這類文字
- 實際：網址停在 `/#/orders/new`。`.error` 的文字是「發生錯誤」，但 `display` 仍是 `none`，`main` 的可見文字沒有「發生錯誤」。console 有 `TypeError: Failed to fetch`
- 證據：`shots/F6-offline-no-error.png`；eval 結果 `err:["none:發生錯誤"]`、`main:false`
- 重現次數：2/2
- 重播：`repro/F6.actions.json`
- 重現腳本：`repro/F6.spec.ts`

### F7 [P1][a11y] 刪除是沒有名稱的 div，鍵盤到不了

- 畫面：S2 訂單列表（`/#/orders`）
- 輪次：小螢幕鍵盤
- 視窗：1440x900
- 重現：
  1. 打開訂單列表
  2. 從頁首開始按 Tab
  3. 看每一列最後的刪除控制
- 預期：刪除是按鈕，有可讀名稱，Tab 得進去，Enter 可打開確認
- 實際：控制是 `div.icon-btn`，內容只有「🗑」，沒有 `aria-label`，`tabIndex` 為 -1。Tab 順序是導覽、篩選、訂單編號連結，不會停在刪除上。滑鼠點了會打開「刪除訂單 #n？」
- 證據：`shots/F2-duplicate-list.png`；`probe-result.json` 的 `not-keyboard-reachable` 與 `no-accessible-name`
- 重現次數：2/2
- 重播：`repro/F7.actions.json`
- 重現腳本：`repro/F7.spec.ts`
- 相關：F19

### F8 [P1][邏輯] 登出再登入仍停在「已取消」，列表是空的且沒有說明

- 畫面：S2 訂單列表（`/#/orders`）
- 輪次：狀態
- 視窗：1440x900
- 重現：
  1. 在訂單列表按「已取消」（目前沒有已取消的訂單）
  2. 登出，再用同一帳號登入
- 預期：回到預設的「全部」，或空列表說明現在是已取消、下一步是什麼
- 實際：登入後仍在 `/#/orders`，「已取消」的 `aria-pressed` 是 true，列數 0。表格只有標題，沒有「沒有資料」或改篩選的提示
- 證據：`shots/S2-desktop.png`（與 `shots/F17-empty-cancelled.png` 同一張畫面）
- 重現次數：2/2
- 重播：`repro/F8.actions.json`
- 重現腳本：`repro/F8.spec.ts`

### F9 [P2][bug] 工單 #3 缺少備註欄位時丟出例外，備註是空白

- 畫面：S3 訂單詳情（`/#/orders/3`）
- 輪次：狀態
- 視窗：1440x900
- 重現：
  1. 打開 `/#/orders/3`
  2. 看備註，並看 console
- 預期：沒有備註時像 #2 一樣顯示「（無備註）」
- 實際：`TypeError: Cannot read properties of undefined (reading 'trim')`，來源在 `renderDetail`。備註標題下面是空的。API 這筆沒有 `note`；#2 的 `note` 是空字串，畫面是「（無備註）」
- 證據：`shots/F8-missing-note.png`；`probe-result.json` 的 `console-error`
- 重現次數：1/1

### F10 [P2][RWD] 工單 #3 的長客戶名稱在手機寬度橫向溢出

- 畫面：S3 訂單詳情（`/#/orders/3`）
- 輪次：小螢幕鍵盤
- 視窗：390x844、320x568
- 重現：
  1. 打開 `/#/orders/3`
  2. 視窗設成 390x844
- 預期：內容在視窗寬度內換行
- 實際：`clientWidth` 390、`scrollWidth` 528。客戶名稱是沒有空格的長字串。320x568 的探測結果同樣溢出
- 證據：`shots/F-overflow-390.png`；`probe-result.json` 的 `horizontal-overflow`
- 重現次數：1/1

### F11 [P2][a11y] 「數量必須是正整數」對比只有 1.56:1

- 畫面：S4 建立訂單（`/#/orders/new`）
- 輪次：設計師
- 視窗：1440x900
- 重現：打開建立訂單，看數量欄位下的提示
- 預期：提示文字和背景對比至少 4.5:1
- 實際：`span.hint` 是 `rgb(200, 200, 200)`，對比 1.56:1。這句話又和實際驗證不符（見 F3）
- 證據：`shots/S4-desktop.png`；`probe-result.json` 的 `low-contrast`

### F12 [P2][斷點] 頁尾「說明」和「聯絡我們」都是找不到頁面

- 畫面：S6 找不到頁面（`/#/help`、`/#/contact`）
- 輪次：新手
- 視窗：1440x900
- 重現：在任一頁點頁尾「說明」或「聯絡我們」
- 預期：打開說明或聯絡方式
- 實際：主內容只有「找不到頁面」，沒有標題，也沒有回到訂單的連結（只剩原本的導覽）
- 證據：`shots/F11-help-404.png`、`shots/S6-desktop.png`

### F13 [P2][a11y] 導覽、頁尾、篩選和核取方塊小於 44px

- 畫面：S1–S6
- 輪次：設計師
- 視窗：1440x900、390x844、320x568
- 重現：量導覽連結、頁尾連結、篩選按鈕、設定頁核取方塊
- 預期：可點目標寬高至少 44px
- 實際：導覽連結約 30×23，頁尾「說明」26×20、「聯絡我們」52×20，篩選與「登出」「登入」「儲存」高度 41，設定核取方塊 13×13。探測在三個尺寸都有 `small-target`
- 證據：`shots/S2-desktop.png`；`probe-result.json` 的 `small-target`

### F14 [P2][文案] 空白表單送出只顯示「發生錯誤」

- 畫面：S4 建立訂單（`/#/orders/new`）
- 輪次：新手
- 視窗：1440x900
- 重現：不填任何欄位，按「送出訂單」
- 預期：指出哪個欄位要填、要怎麼改
- 實際：欄位沒有必填標記。可見錯誤只有紅色「發生錯誤」，沒有發出 API。數量提示一直顯示，但不能解釋客戶名稱和品項也是空的
- 證據：`shots/F13-vague-error.png`

### F15 [P2][UX] 重新整理後篩選回到「全部」

- 畫面：S2 訂單列表（`/#/orders`）
- 輪次：狀態
- 視窗：1440x900
- 重現：按「待處理」，確認列表少了已完成的那一列，然後重新整理
- 預期：仍然停在「待處理」
- 實際：重新整理後「全部」的資料都回來了，包含已完成的 #2
- 證據：`shots/F14-filter-all.png`
- 相關：F8（登出反而會留著篩選）

### F16 [P2][UX] 建立訂單填到一半離開，沒有未儲存提示

- 畫面：S4 建立訂單（`/#/orders/new`）
- 輪次：狀態
- 視窗：1440x900
- 重現：客戶名稱填「還沒送出」，再點導覽「訂單」
- 預期：離開前提示有未送出的內容
- 實際：沒有 `beforeunload` 或頁內對話框，直接到列表，輸入消失
- 證據：`shots/S4-desktop.png`（離開後的對話框不存在；當下 `dialog` 紀錄是空的）

### F17 [P2][UX] 登入後不會回到原本要看的工單

- 畫面：S1 登入、S3 訂單詳情
- 輪次：狀態
- 視窗：1440x900
- 重現：登出後直接打開 `/#/orders/1`，再登入
- 預期：登入後進入工單 #1
- 實際：未登入時被送到 `/#/login`。登入後停在 `/#/orders`，不是 `#/orders/1`
- 證據：`shots/S2-desktop.png`

### F18 [P2][a11y] 刪除對話框按 Esc 關不掉，焦點也沒有留在對話框裡

- 畫面：S2 訂單列表（`/#/orders`）
- 輪次：小螢幕鍵盤
- 視窗：1440x900
- 重現：點垃圾桶打開「刪除訂單 #n？」，按 Esc，再按 Tab
- 預期：Esc 關閉對話框；Tab 只在「取消」和「刪除」之間移動
- 實際：Esc 之後對話框還在。焦點在 `body`，Tab 會跑到對話框外面的連結。點背景可以關閉。按鈕文字是「取消」「刪除」，不是泛用的「確定」
- 證據：`shots/F-delete-modal.png`

### F19 [P2][斷點] 非 hash 的未知網址只回 JSON

- 畫面：S7 非 SPA 404（`/not-a-page`）
- 輪次：新手
- 視窗：1440x900
- 重現：打開 `http://localhost:4173/not-a-page`
- 預期：和站內一樣的找不到頁面，並有回到訂單的連結
- 實際：整頁是 `{"error":"not found"}`，沒有導覽
- 證據：`shots/S7-desktop.png`；`probe-result.json` 的 `failed-request`（404 本身是這一頁的回應）

### F20 [P3][文案] 列表叫「訂單」，詳情叫「工單」

- 畫面：S2、S3
- 輪次：新手
- 視窗：1440x900
- 重現：從訂單列表點進 #1
- 預期：同一件事用同一個名稱
- 實際：列表標題是「訂單」，詳情標題是「工單 #1」
- 證據：`shots/S3-desktop.png`

### F21 [P3][UI] 主要按鈕圓角 4px，次要按鈕圓角 12px

- 畫面：S4 建立訂單
- 輪次：設計師
- 視窗：1440x900
- 重現：比較「送出訂單」和「取消」
- 預期：同一層級的按鈕圓角一致
- 實際：「送出訂單」`border-radius` 4px，「取消」和「登出」12px。hover「送出訂單」時背景仍是 `rgb(47, 111, 237)`，沒有分開的 hover 色
- 證據：`shots/S4-desktop.png`

### F22 [P3][UI] 詳情的返回連結是紫色，其他動作是藍色

- 畫面：S3 訂單詳情
- 輪次：設計師
- 視窗：1440x900
- 重現：看「← 回列表」和頁首的「建立訂單」
- 預期：連結色和全站主色一致
- 實際：「回列表」是預設連結紫，主要按鈕是 `rgb(47, 111, 237)`
- 證據：`shots/S3-desktop.png`
