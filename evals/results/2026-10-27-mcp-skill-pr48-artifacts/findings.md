# findings

證據欄的「探測」指 `probe-result.json`（9222 那個 Chrome，探測自己登入）；其他都是 MCP 工具在 MCP 的 Chrome 上做的。

## F1 頁尾「說明」「聯絡我們」都是找不到頁面（S6，P2，bug／Nielsen 10）
- 重現：`#/help`、`#/contact` 都顯示「找不到頁面」，沒有 h1、沒有回上一頁。證據：shots/F-footer-404.png
## F2 建立訂單空白送出只顯示「發生錯誤」（S4，P2，文案／Nielsen 9）
- 重現：`#/orders/new` 不填任何欄位按「送出訂單」→ 只出現 `P.error`「發生錯誤」，沒有標出欄位；`:invalid` 0 個。證據：shots/F-empty-submit.png
## F3 詳情標題叫「工單 #n」，其他地方都叫「訂單」（S3，P3，一致性／Nielsen 4）
- 重現：`#/orders/3`、`#/orders/6` h1 都是「工單 #n」；導覽、列表、按鈕都是「訂單」。證據：shots/F-negative-qty.png
## F4 列表刪除 🗑 是 DIV，Tab 到不了、沒有名稱（S2，P2，無障礙）
- 重現：探測 `not-keyboard-reachable`、`no-accessible-name` 都指到 `div.icon-btn`（每列 🗑）。證據：探測
## F5 數量 -3 可以建立訂單，小計 NT$ -300（S4，P2，bug／Nielsen 5）
- 重現：客戶「負數測試」、品項「滑鼠」、數量 -3、單價 100 → 送出前小計已顯示「NT$ -300」→ 建立 `#/orders/6`，數量 -3。提示「數量必須是正整數」沒有擋。證據：shots/F-negative-qty.png
## F6 連點「送出訂單」建立兩筆訂單（S4，P1，bug）
- 重現：探測 `double-submit`：雙擊送出 → 2 筆 `POST /api/orders`。MCP 重做：同一個 `evaluate_script` 連呼叫兩次 `.click()` → POST ×2（2/2，見 critic-verdicts）。證據：探測、critic 紀錄
## F7 建立訂單填到一半，上一頁再下一頁，欄位全空且沒有提示（S4，P2，bug／Nielsen 3）
- 重現：填客戶、品項、備註（長度 2、2、2）→ `navigate_page back` → `forward` → 5 個欄位長度全 0。證據：shots/F-back-forward-lost.png
## F8 「已完成」篩選列出待處理訂單（S2，P1，bug）
- 重現：`#/orders` 點「已完成」（真實點擊）→ 6 列，只有 #2 是已完成，其他是待處理。證據：shots/F-completed-filter.png；critic 2/2
## F9 「已取消」沒有資料時只剩表頭，沒有空狀態說明（S2，P3，空狀態）
- 重現：點「已取消」→ tbody 0 列，沒有任何說明或下一步。證據：shots/F-cancelled-empty.png
## F10 篩選在重新整理後回到「全部」（S2，P2，狀態）
- 重現：點「已完成」→ `navigate_page reload` → pressed 是「全部」、6 列；網址沒有篩選參數。證據：shots/F-filter-reset.png
## F11 設定按「儲存」沒有送出請求，重新整理後還原（S5，P1，bug）
- 重現：`#/settings` 每頁筆數 10→20、通知 true→false → 按「儲存」→ `list_network_requests` 只有 `GET /api/orders`，沒有寫入請求 → reload 後回到 10／true。證據：shots/F-settings-save.png；critic 2/2
## F12 #3 備註空白，console `TypeError: ... reading 'trim'`（S3，P2，bug）
- 重現：探測 `console-error`：`#/orders/3` 出現 TypeError（reading 'trim'），`#/orders/1`、`#/orders/2` 沒有。MCP：`#/orders/3` 備註欄空白。證據：探測
## F13 不存在的訂單顯示「工單 #undefined」「NT$ 非數值」（S3，P2，bug／Nielsen 9）
- 重現：`#/orders/999` → h1「工單 #undefined」、小計「NT$ 非數值」、狀態「undefined」；console 404 + `Uncaught (in promise)`。證據：shots/F-order-999.png
## F14 未登入開深連結，登入後回到列表不是原頁（S1，P2，狀態）
- 重現：清掉 storage → 開 `#/orders/2` → 被導到 `#/login` → 登入 → 落在 `#/orders`。證據：shots/F-deeplink-lost.png
## F15 按鈕圓角不一致：主要 4px、次要 12px（全站，P3，一致性）
- 重現：computed style：「建立訂單」「送出訂單」4px；篩選、登出、「取消」12px。證據：evaluate 紀錄
## F16 手機上 #3 長客戶名把頁面撐出橫捲（S3，P2，RWD）
- 重現：探測 `horizontal-overflow`：390 寬 `#/orders/3` scrollWidth 536。證據：探測
## F17 手機上固定頁尾蓋住「送出訂單」與列表最後一列（S4／S2，P1，RWD）
- 重現：390×844，`#/orders/new` 空白送出後出現「發生錯誤」，按鈕下移到 y 713–754；固定 footer 從 y 724 起、高 120px，`main` padding-bottom 0、頁面高度 844 無法捲動；`elementFromPoint` 在按鈕中線與下緣打到 FOOTER（2/2）。未出錯時按鈕 676–716 沒被蓋。列表捲到底，最後一列 667–756 也被 footer 蓋住。證據：shots/F-mobile-footer-covers-submit.png、shots/F-mobile-last-row.png
## F18 刪除確認框按 Esc 關不掉，焦點不在框內（S2，P2，無障礙）
- 重現：點 🗑 → 確認框「刪除訂單 #6？」→ `press_key Escape` → 仍開著；沒有 role／aria-modal；焦點 BODY。用「取消」關掉，沒有刪除。證據：shots/F-modal-esc.png
## F19 列表 API 500 或離線時一直「載入中…」（S2，P1，bug）
- 重現：探測 `stuck-loading`（500 與 offline 兩種）。MCP：攔截 `GET /api/orders` 回 500 → 5.5 秒後仍「載入中…」、0 列（2/2）。證據：探測、critic 紀錄
## F20 離線送出建立訂單，畫面沒有任何反應（S4，P1，bug）
- 重現：探測 `no-feedback`（offline 送出）。MCP：讓 POST reject（`Failed to fetch`）→ 1.5 秒後網址仍 `#/orders/new`、畫面文字沒變、`.error` 不可見、按鈕仍 enabled（2/2）。證據：shots/F-offline-submit.png
## F21 「數量必須是正整數」提示對比 1.56:1（S4，P2，無障礙）
- 重現：探測 `low-contrast`：`span.hint` rgb(200,200,200) on white，1.56:1。證據：探測
## F22 送出時 API 回 500，跳到 `#/orders/undefined`「找不到頁面」（S4，P2，bug）
- 重現：探測 `no-error-message`：送出時 `/api/orders` 回 500 → 網址變 `#/orders/undefined`，顯示「找不到頁面」，沒有說明失敗。證據：探測
