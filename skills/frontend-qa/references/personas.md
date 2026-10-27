# 角色與招式

一輪只扮演一個角色。操作只用 [SKILL.md](../SKILL.md#需求) 列出的 chrome-devtools-mcp 工具，不換成其他瀏覽器工具。動作的目標一律是最新一次 `take_snapshot` 的 `uid`。

每一輪開始前先 `list_console_messages`（`types` 含 `error`），記下目前最大的 msgid。這一輪只把更大的 msgid 算進來。不要為了清 console 而重新載入，除非這一輪本來就要重新進入該畫面。`list_console_messages` 預設只列出上次導覽之後的訊息。

## 新手

**心態**：第一次來，沒看說明，只靠畫面上看到的東西決定下一步。

**招式**
- 每到一個畫面，先在不操作的情況下回答三個問題：這頁是做什麼的？我現在該做什麼？做完會去哪裡？只要有一題答不出來，就記成問題。
- 只照畫面文字的字面意思操作。按鈕寫「確定」，卻不知道會確定什麼，就記錄下來。
- 找出主要任務的入口，並記下花了幾步。三步以上才找到，或需要用猜的，就記錄下來。
- 故意走錯一步（點錯選項、填錯欄位），看系統有沒有告訴你錯在哪、要怎麼回頭。
- 留意專有名詞、縮寫、內部用語，以及同一個東西在不同地方叫不同名字。

**找什麼**：入口藏太深、文案模糊、下一步不明確、錯誤訊息沒說怎麼修、用詞不一致。

## 亂點

**心態**：沒耐心又手殘，一直按、按錯、按到一半就跑掉。

**招式**
- 連點兩下或三下送出按鈕，檢查是否重複送出或重複建立。`click` 一次只點一下，而且會等工具回傳，做不出同一瞬間的連點。改用 `evaluate_script`，在同一個函式裡對該按鈕連續呼叫兩次 `.click()`（按鈕用 role 與可及名稱找）。再用 `list_network_requests`（`resourceTypes` 含 `xhr`、`fetch`）或列表確認送出了幾次。這段連點寫進 `repro/<id>.steps.md` 的一個步驟，複驗時整份 steps 檔重播，見 [repro.md](repro.md#steps-檔)。
- 流程做到一半時：按上一頁（`navigate_page` 的 `type` 為 `back`）、重新整理（`type` 為 `reload`）、用 `new_page` 開同一個網址。檢查資料是否不見、狀態是否錯亂、是否重複送出。
- 在每個輸入框依序試：空白、只有空格、500 字以上的長字串、emoji `🙃👨‍👩‍👧`、`<script>`、`' OR 1=1`、全形數字、負數、`0`、貼上含換行或格式的文字。
- 在載入完成前就點下一步，或在動畫播到一半時點擊。
- 開啟 modal 後按 Esc、點背景、再按上一頁。
- 操作中途把視窗縮小再放大（`resize_page` 寬 800、高 600，再改回原尺寸）。

**找什麼**：重複送出、狀態遺失、當掉、畫面卡住、沒有做輸入驗證、長字串撐破版面、在不該能按的時機還能按。

## 設計師

**心態**：一像素都要計較，同一層級的元素必須長得一模一樣。

**招式**
- 每個畫面在桌機尺寸看一張全頁截圖（`take_screenshot`，`fullPage` 為 true，`filePath` 為 `shots/S<n>-desktop.png`，再用 Read 打開），檢查對齊、間距節奏、字級層級、顏色是否一致。小尺寸先用 `evaluate_script` 查橫向捲動和點擊目標大小，發現疑點才看那個尺寸的截圖。這是 SKILL.md「截圖規則」中看圖額度的主要用途，同一個畫面、同一個尺寸不要看第二張；其他細節用 `evaluate_script` 讀 `getComputedStyle`。
- 對同類元素（按鈕、卡片、標題）用 `evaluate_script` 讀 `getComputedStyle`，比對尺寸、圓角、字重是否一致。主要和次要按鈕圓角不同時，先查 design-context 或設計系統有沒有刻意區分（膠囊形主要按鈕、圖示按鈕、連結式按鈕）；只有不是刻意的，才記成 P3 一致性問題。比對時要比這兩顆按鈕，不要只比輸入框和按鈕，或只比登入頁和站內頁。
- 檢查 hover、focus、active、disabled 四種狀態都有設計，而且彼此看得出差別（`hover` 的 uid 來自最新 `take_snapshot`；focus 用 `press_key` 送 `Tab`，再 `take_snapshot` 或 `evaluate_script` 看 `:focus` 的樣式）。
- 有測深色模式時，`emulate` 的 `colorScheme` 設為 `dark`，每個畫面在桌機尺寸看一張深色截圖，額度另計（見 SKILL.md「截圖規則」的主題數）；文字和背景的對比用 `evaluate_script` 讀前景色和背景色。測完把 `colorScheme` 設回 `light`。
- 留意文字被截斷、圖片變形、圖示風格混用、icon 和文字基線沒對齊、空白分配不平均。

**找什麼**：不一致、不對齊、對比不足、狀態沒設計、深色模式破版、整體看起來廉價或雜亂。這類問題預設歸為 P3，除非已經影響可讀性或操作。

## 小螢幕鍵盤

**心態**：用手機，或者只用鍵盤，沒有滑鼠。

**招式**
- 用 `390x844` 和 `320x568` 把主要流程完整走一遍（`resize_page` 設寬與高）。要連觸控與 mobile 版面一起模擬時，改用 `emulate` 的 `viewport`（`390x844x1,mobile,touch`）。每個尺寸各做一次。
- 檢查是否出現橫向捲動、元素重疊、按鈕小於 44px、固定定位的 header 或 footer 擋住內容、手機鍵盤彈出後輸入框被蓋住。在 `390x844`、不要先捲動長列表，用 `evaluate_script` 的 `elementFromPoint` 取該畫面主要動作按鈕的中心，記下命中的是不是固定的 footer 或 header。`take_screenshot` 的 `fullPage` 會把 `position:fixed` 的 footer 畫進長頁面的中間，那是工具合成結果，不能代替這次點擊檢查。
- 只用 `press_key` 的 Tab、Shift+Tab、Enter、Space、Escape 完成主要任務。檢查 focus 順序是否合理、焦點是否看得見、modal 是否把焦點限制在 modal 內、關閉後焦點是否回到原本的位置。
- 檢查圖示按鈕有沒有可讀的名稱（看 `take_snapshot` 的 accessible name）。

**找什麼**：跑版、點不到、鍵盤無法完成任務、焦點消失、沒有可讀名稱。

## 惡劣環境

**心態**：網路很差、後端不穩、時間不對。

**招式**
- 用慢網路走一次主要流程（`emulate` 的 `networkConditions` 為 `Slow 3G`），檢查有沒有載入提示、能不能重複送出、會不會一直卡在 spinner。測完再呼叫 `emulate` 且不要帶 `networkConditions`（若這輪還要維持深色或 viewport，那些欄位同一呼叫裡再帶一次）。
- 在流程中途斷網（`networkConditions` 為 `Offline`），然後同樣省略 `networkConditions` 恢復，看資料會不會遺失、有沒有提示。送出的當下斷網，而且畫面上完全沒有反應（無法判斷寫入有沒有成功），要記成問題。
- 讓 API 回傳 500、401、空陣列、超大資料量：沒有攔截請求的工具。用 `evaluate_script` 包一層 `window.fetch`（頁面若用 XHR 也一併包住），只攔這次要看的網址片段，回傳指定狀態與本文。測完 `navigate_page`（`type` 為 `reload`）還原。
- 凍結或位移時間：用 `evaluate_script` 取代 `Date.now` 與 `new Date`。測完 `navigate_page`（`type` 為 `reload`）還原。沒有凍結時鐘的專用工具。
- 明顯的慢請求用 `list_network_requests` 看。不要呼叫清單以外的效能工具。

**找什麼**：沒有錯誤處理、錯誤訊息看不懂、spinner 永遠不停、資料遺失、版面跳動、時間顯示錯誤。

## 狀態

這一輪不扮演角色，而是對每個畫面逐項檢查 [state-checklist.md](state-checklist.md)。
