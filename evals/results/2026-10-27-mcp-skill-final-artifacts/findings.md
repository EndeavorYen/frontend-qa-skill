# findings

## F1 頁尾「說明」「聯絡我們」都是找不到頁面（S6，P2，bug／Nielsen 10）
- 重現：任一頁點頁尾「說明」或「聯絡我們」→ `#/help`、`#/contact` 顯示「找不到頁面」。證據：shots/F1-help-404.png
## F2 建立訂單空白送出只顯示「發生錯誤」（S4，P2，文案／Nielsen 9）
- 重現：`#/orders/new` 不填任何欄位按「送出訂單」→ 表單下方只出現「發生錯誤」，沒有標出哪個欄位、怎麼修；`:invalid` 0 個。證據：shots/F2-empty-submit.png
## F3 詳情標題叫「工單 #n」，其他地方都叫「訂單」（S3，P3，一致性／Nielsen 4）
- 重現：`#/orders/1` h1 為「工單 #1」；導覽、列表、按鈕都是「訂單」。證據：shots/F3-detail-term.png
## F4 列表刪除 🗑 是沒有 role、名稱的 DIV，Tab 到不了（S2，P2，無障礙）
- 重現：`#/orders` 每列 🗑：tag DIV、role null、tabIndex -1、無 aria-label/title；鍵盤使用者無法刪除，螢幕閱讀器只念「🗑」。證據：shots/F4-trash-div.png
## F5 數量 -3 可以建立訂單，小計 NT$ -300（S4，P2，bug／Nielsen 5）
- 重現：`#/orders/new` 填 客戶「負數測試」、品項「滑鼠」、數量 -3、單價 100 → 送出 → `#/orders/4` 數量 -3、小計 NT$ -300。欄位旁提示「數量必須是正整數」卻沒擋。證據：shots/F5-negative-qty.png
## F6 連點「送出訂單」建立兩筆一樣的訂單（S4，P1，bug）
- 重現：`#/orders/new` 填好欄位，同一個 `evaluate_script` 對「送出訂單」連呼叫兩次 `.click()` → `list_network_requests` 出現 2 筆 `POST /api/orders [201]`（reqid 99、100），列表多出 #5、#6 兩筆相同訂單；按鈕送出後仍 enabled。證據：shots/F6-double-submit.png
## F7 建立訂單填到一半，上一頁再下一頁，欄位全空且沒有提示（S4，P2，bug／Nielsen 3）
- 重現：`#/orders/new` 填客戶、品項、備註 → `navigate_page back` → `forward` → 5 個欄位長度全 0，沒有「未儲存」提示。證據：shots/F7-back-forward-lost.png
## F8 「已完成」篩選列出待處理訂單（S2，P1，bug）
- 重現：`#/orders` 點「已完成」→ 列出 #1、#3–#6 待處理 和 #2 已完成，跟「全部」一樣。證據：shots/F8-completed-filter.png
## F9 「已取消」沒有資料時只剩表頭，沒有空狀態說明（S2，P3，空狀態）
- 重現：`#/orders` 點「已取消」→ tbody 0 列，只剩表頭，沒有「沒有已取消的訂單」或下一步。證據：shots/F9-cancelled-empty.png
## F10 選「待處理」後重新整理，篩選跳回「全部」（S2，P2，bug／狀態保留）
- 重現：`#/orders` 點「待處理」（5 列）→ `navigate_page reload` → 快照「全部」pressed，列出 6 列；網址沒有帶篩選。證據：shots/F10-filter-reset.png
## F11 設定按「儲存」顯示「已儲存」，其實沒有存（S5，P1，bug／Nielsen 1）
- 重現：`#/settings` 顯示名稱改「QA 小陳」、每頁筆數改 20 → 儲存 → 畫面出現「已儲存」，但 3 秒內沒有任何新請求，header 仍是「qa」；`navigate_page reload` 後兩欄都回到 qa／10。證據：shots/F11-settings-not-saved.png
## F12 #3 詳情備註空白，console 有 `Uncaught (in promise)`（S3，P2，bug）
- 重現：打開 `#/orders/3` → 備註欄空白（#2 會顯示「（無備註）」），`list_console_messages` 新增 msgid 33 `Uncaught (in promise)`；#1、#2 沒有。證據：shots/F12-order3-note-error.png
## F13 不存在的 `#/orders/999` 顯示「工單 #undefined」「NT$ 非數值」（S3，P2，bug）
- 重現：直接開 `#/orders/999` → API 404（msgid 34）、`Uncaught (in promise)`（msgid 35），畫面「工單 #undefined」「NT$ 非數值」「狀態 undefined」，沒有「找不到訂單」和回列表以外的說明。證據：shots/F13-order999.png
## F14 未登入開 `#/orders/2`，登入後回到 `#/orders`，不是原本要去的頁（S1，P2，bug／深層連結）
- 重現：登出 → `navigate_page` `#/orders/2` → 被導到 `#/login` → 帳號 qa、密碼 `<secret QA_PASSWORD: entered by a person, not by a tool>` → 登入 → `#/orders`。證據：shots/F14-deeplink-lost.png
## F15 主要按鈕圓角 4px，次要／篩選按鈕 12px（S2/S4/S5，P3，一致性）
- 證據：`getComputedStyle`：建立訂單／送出訂單／儲存 4px；全部／待處理／取消 12px；同高 40.5px、同字級。無 design-context 說明刻意區分。shots/S2-desktop-1280.png
## F16 手機 390 寬開 #3 詳情，長客戶名撐出橫向捲動（S3，P2，跑版）
- 重現：`emulate` 390x844 mobile → `#/orders/3` → `innerWidth` 被撐到 536、`scrollWidth` 536 > 390。證據：shots/F16-detail-overflow-390.png
## F17 手機列表捲到底，最後一列下半被固定 footer 蓋住（S2，P3，跑版）
- 重現：390x844 `#/orders` 捲到底（scrollY 68）→ 最後一列 667–756，footer 從 724 起（fixed），列的下 32px 在 footer 下。證據：shots/F17-footer-covers-row-390.png
## F18 刪除確認框按 Esc 關不掉，焦點在 BODY，沒有 role=dialog（S2，P2，無障礙／Nielsen 3）
- 重現：`#/orders` 點 #6 的 🗑 → 「刪除訂單 #6？」→ `press_key Escape` → 仍開著；`activeElement` BODY，焦點不在框內；無 `role`、`aria-modal`。用「取消」關閉，未刪除。證據：shots/F18-modal-esc.png
## F19 訂單 API 回 500 或 401 時，列表永遠停在「載入中…」，沒有錯誤訊息也沒有重試（S2，P1，bug／Nielsen 9）
- 重現：在頁內把 `GET /api/orders` 改回 500（再試 401）→ 切到 `#/settings` 再回 `#/orders` → 等 5.5 秒 → main 仍是「載入中…」。401 也沒有導回登入。證據：shots/F19-list-500-loading.png
## F20 離線送出訂單，畫面沒有任何回饋，按鈕可再按（S4，P2，bug／Nielsen 1）
- 重現：`#/orders/new` 填好 → `emulate` Offline → 點「送出訂單」→ 4 秒後仍在表單、無錯誤訊息、按鈕未停用；console msgid 47 `ERR_INTERNET_DISCONNECTED`、48 `Uncaught (in promise)`。證據：shots/F20-offline-submit.png
## F21 數量欄下方提示「數量必須是正整數」對比 1.56:1（S4，P2，無障礙／可讀性）
- 證據：`span.hint` 前景 rgb(200,200,200)、背景 rgb(246,247,249)、13px，低於 4.5:1。前面在列表頁掃對比沒有掃到這頁。shots/F20-offline-submit.png
