# 工具軌（chrome-cdp-ex）

- chrome-cdp-ex: e2fa112（https://github.com/EndeavorYen/chrome-cdp-ex.git）
- Chrome: HeadlessChrome/153.0.8010.12（Linux x86_64），CDP 127.0.0.1:9444
- Node: v22.22.3

### T1 [bug] 第一次 `nav` 回報 ambiguous-action-completion（daemon 連線中斷），但導覽其實成功

- 指令：`nav <t> http://localhost:4173`（分頁原本是 about:blank，這是該分頁的第一個指令，daemon 尚未啟動）
- 預期：回報 URL + title
- 實際：`Error: The daemon did not return a validated Action Result ... Transport: awaiting-response/peer-end: Connection closed before response.`，exit 1
- 替代方法：照 Next 執行 `perceive`，頁面已在目標 URL（/#/login），導覽實際已完成
- 重現條件：`nav` 到一個會被 app 立刻改寫 hash 的網址（例如 `/` 被導到 `/#/login`；登出後 `nav` 到 `/#/orders/1`、`/#/orders/new`、`/#/settings` 被導回 `/#/login`）。4/4 次都發生
- 影響：無格子被阻擋

### T2 [bug] perceive 指派的 @ref 在之後的指令中消失，回報「No refs have been assigned in this daemon yet」

- 指令：`perceive <t> -C -d 8`（成功列出 @1–@5）→ `eval` → `html` → `console --clear` → `click <t> @3`
- 預期：@3 仍有效（頁面沒有導覽）
- 實際：`Error: Unknown ref: @3. No refs have been assigned in this daemon yet.`（Kind: stale-ref）
- 替代方法：再跑一次 `perceive` 或改用 CSS selector
- 重現條件：發生在 T1 的 daemon 中斷之後；推測 daemon 被重啟，但 perceive/eval/html 都沒有提示 daemon 換過
- 影響：無格子被阻擋；之後改用 CSS selector

### T3 [bug] `click` 偶發回報 ambiguous-action-completion（daemon 連線中斷），點擊實際已生效

- 指令：`click <t> "button[data-filter=已取消]"`
- 實際：同 T1 的 `Transport: awaiting-response/peer-end: Connection closed before response.`，但之後讀 DOM 發現點擊已生效（aria-pressed=true）
- 替代方法：讀 DOM 確認狀態，不重複點擊
- 重現條件：同一個分頁連續下多個 click/eval 指令時偶發；另外在登入頁 `click` 登入按鈕（成功後 app 改寫 hash 到 /#/orders）也發生一次。與 T1 疑為同一根因（daemon 在 hash 導覽或連續操作時中途結束）
- 影響：無格子被阻擋，但每次都得額外驗證

### T4 [bug] `click` 回報 `Outcome: no-change`，但按鈕的 aria-pressed 實際已改變

- 指令：重新整理後 `click <t> "button[data-filter=已完成]"`（以及 `--js`）
- 預期：Outcome: changed（按鈕的 aria-pressed 由 false 變 true、樣式改變）
- 實際：`Outcome: no-change`；DOM 讀值 aria-pressed=true
- 推測：settle-diff 只看文字/結構，不看屬性變化
- 影響：容易讓人誤判「點了沒反應」

### T5 [bug] `netlog` 一次漏記 DELETE 請求（回報 No network requests captured）

- 指令：`click <t> "[data-del='8']"` → `netlog <t> --clear` → `click <t> "[data-act=delete]"` → `netlog <t>`
- 預期：列出 DELETE /api/orders/8 與之後的 GET /api/orders
- 實際：`No network requests captured`；但重新整理後 #8 確實已被刪除（伺服器端已收到 DELETE）
- 替代方法：在頁面內包一層 `window.fetch` 記錄；同樣步驟重做一次時 netlog 正常列出 `DELETE … → 204`
- 重現條件：1/2，推測與 T1/T3 的 daemon 中途重啟有關（重啟後網路緩衝被清空）
- 影響：無格子被阻擋

### T6 [摩擦] `netlog --all` 不是有效旗標，但 `console --all` 是

- 指令：`netlog <t> --all`
- 實際：`Kind: usage`；兩個「列出紀錄」的指令旗標不一致，要查 help 才知道
- 建議：`netlog` 接受 `--all` 作為別名，或在 usage 錯誤中直接列出可用旗標

### T7 [摩擦] `scroll <t> "to bottom"`（加引號成一個參數）被拒絕

- 指令：`scroll <t> "to bottom"`
- 實際：`Error: Direction required: down, up, left, right, x,y, or to top/to bottom`、`Kind: unknown`；錯誤訊息本身就寫了 `to bottom`，看不出錯在哪。改成不加引號的 `scroll <t> to bottom` 才成功
- 建議：接受單一參數 "to bottom"；或在錯誤中說明要分成兩個參數；`Kind` 應為 usage 而不是 unknown

### T8 [摩擦] `eval` 在全域執行，前一次 eval 宣告的 `const` 會讓下一次 eval 報 SyntaxError

- 指令：連續兩次 `eval <t> "const f=...; ..."`
- 實際：第二次 `SyntaxError: Identifier 'f' has already been declared`
- 替代方法：包成 IIFE `(()=>{...})()`
- 建議：文件註明 eval 的作用域會跨呼叫保留，或提供 `--isolated` 自動包 IIFE

### T9 [摩擦] `viewport` 改尺寸後回報 `Verdict: investigate` / `Outcome: no-change`

- 指令：`viewport <t> 800x600`、`viewport <t> 1440x900`
- 實際：尺寸確實改了，但回報 `Outcome: no-change … Verdict: investigate`，讓人以為失敗；回報有 20 行
- 建議：viewport 的成功條件應是尺寸已套用，而不是 AX tree 是否變化

### T3 補充

- 在 `/#/orders/new` 對不存在的 selector `[data-del='12']` 下 `click`，也出現同樣的 ambiguous-action-completion（daemon 連線中斷），而不是預期的 `Kind: selector`；緊接著的下一個 click 才回報 `Element not found`

### T10 [bug] `press <t> Enter` 不會觸發表單的隱式送出（沒有送出 keypress / text）

- 指令：焦點在登入表單的密碼欄，`press <t> Enter`
- 預期：和真人按 Enter 一樣送出表單
- 實際：回報 `Pressed Enter.`，但頁面只收到 `keydown`、`keyup`，沒有 `keypress`、`click`、`submit`；表單沒有送出
- 替代方法：`evalraw <t> Input.dispatchKeyEvent '{"type":"keyDown","key":"Enter","code":"Enter","windowsVirtualKeyCode":13,"text":"\r"}'`（加上 `text`）→ 頁面收到 keypress → click → submit，正常送出
- 重現條件：任何依賴瀏覽器隱式送出（Enter 送出 form）的表單；最小重現：`<form onsubmit="...">` 內一個 input
- 影響：差一點把「鍵盤無法登入」誤判成產品 bug；鍵盤測試的 Enter 改用 evalraw

### T3 補充 2

- 對話框開啟時 `click <t> "[data-act=cancel]"` 也出現 ambiguous-action-completion，而這次點擊**沒有**生效（對話框仍開著）；照 `Retry safe: no` 不重試的話會卡住。重新下同一個指令就成功
- 到目前為止在約 150 個指令中發生 9 次（nav ×5、click ×3、press 迴圈 ×1）

### T11 [bug] daemon 中途重啟（T1/T3）後，`throttle` / `mock` 狀態被悄悄清掉

- 指令：`throttle <t> offline` → 一連串 click/eval（其中一次出現 T3 的 ambiguous-action-completion）→ `throttle <t>`
- 預期：仍為 offline，或明確告知「daemon 已重啟，網路條件已重設」
- 實際：`Network throttle: off`；同樣地，mock 規則在 daemon 重啟後也沒有命中（已取消篩選回到真實資料）。netlog 緩衝也被清空（見 T5）
- 替代方法：每次關鍵步驟前重新套用 throttle/mock，並用頁面內 fetch 包裝或 `performance` API 驗證
- 影響：惡劣環境輪的結果要額外驗證，否則可能把「網路其實正常」誤判成產品處理了錯誤

---

## 收尾分類

| 組 | 編號 | 根因 / 主題 | 去重結果 | 處置 |
|---|---|---|---|---|
| bug | T1、T2、T3 | Linux 上 tab daemon 在指令中途或之間結束（Connection closed / Unknown ref） | 既有 #549（已關閉，修正在 e2fa112 之後合入；本次版本正是 e2fa112） | 併入 #549，不另開；建議升級後重測 |
| bug | T5、T11 | daemon 重啟後 throttle / mock / netlog 狀態被悄悄清掉，沒有任何提示 | 搜尋 "throttle reset daemon"、"netlog missing requests" 無相符 | 草稿 A（新 issue） |
| bug | T10 | `press Enter` 沒送 text，不觸發 keypress 與表單隱式送出 | 搜尋 "press Enter keypress"、"implicit submission"、"dispatchKeyEvent text Enter" 無相符 | 草稿 B（新 issue） |
| bug | T4 | 只改屬性（aria-pressed / class）的點擊被判為 Outcome: no-change | 搜尋 "aria-pressed"、"attribute change no-change" 無相符（#279/#259 是不同觸發條件，已關閉） | 草稿 C（新 issue） |
| 摩擦 | T9 | `viewport` 成功後回報 no-change / Verdict: investigate | 無相符 | 草稿 D（proposal） |
| 摩擦 | T6 | `netlog --all` 不被接受，與 `console --all` 不一致 | 無相符（#108 是 console 旗標） | 草稿 E（proposal） |
| 摩擦 | T7 | `scroll "to bottom"` 單一參數被拒 | 既有 #560（已關閉，修正在 e2fa112 之後） | 併入 #560，不另開 |
| 摩擦 | T8 | eval 的頂層宣告跨呼叫殘留 | 既有 #552 第 5 點（開啟中，內容相同） | 併入 #552，不另留言（無新資訊） |

> 依使用者指示，本次**只寫草稿，未發出任何 issue 或留言**。以下草稿等使用者逐筆同意後才可發出；所有被測網站的網址、名稱、資料都已改寫為通用描述。

## Issue 草稿

### 草稿 A（新 issue，對應 T5、T11）

**標題**：daemon restart silently drops throttle, mock and netlog state

## 環境
- chrome-cdp-ex: e2fa112 (2.20.0)
- Chrome: HeadlessChrome 153.0.8010.12
- OS / Node: Linux 6.8, Node v22.22.3

## 重現
1. 在任一會呼叫 fetch 的 SPA 分頁：`cdp throttle <t> offline`（或 `cdp mock <t> add "**/api/*" --status 500`）
2. 連續下多個 `click` / `eval`，直到其中一個出現 `ambiguous-action-completion`（#549 的 daemon 中斷）
3. `cdp throttle <t>`、`cdp mock <t>`、`cdp netlog <t>`

## 預期
網路條件與 mock 規則保留；或任何一個指令明確提示「daemon 已重啟，throttle/mock/netlog 已重設」。

## 實際
`Network throttle: off`、mock 不再命中、`netlog` 回報 `No network requests captured`（但伺服器端確實收到 DELETE）。沒有任何訊息說明狀態被重設，容易把「網路其實正常」誤判成頁面處理了離線狀態。

## 替代方法
每個關鍵步驟前重新套用 throttle/mock；以頁面內 fetch 包裝或 `performance.getEntriesByType('resource')` 驗證請求。

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的。根因可能與 #549 相同，但即使 #549 修好，daemon 因其他原因重啟（idle timeout、崩潰）時仍會遇到；建議 daemon 啟動時若偵測到前一個 session 有 throttle/mock，在第一個回報中加上警告，或把這些狀態持久化後重新套用。

### 草稿 B（新 issue，對應 T10）

**標題**：press: `press <t> Enter` does not trigger implicit form submission (no keypress / text)

## 環境
- chrome-cdp-ex: e2fa112 (2.20.0)
- Chrome: HeadlessChrome 153.0.8010.12
- OS / Node: Linux 6.8, Node v22.22.3

## 重現
1. 開一個最小頁面：`<form onsubmit="event.preventDefault();document.title='submitted'"><input name=a><button>Go</button></form>`
2. `cdp click <t> "input[name=a]"`，`cdp type <t> "x"`
3. `cdp press <t> Enter`
4. `cdp eval <t> "document.title"`

## 預期
和真人按 Enter 一樣：頁面收到 keydown → keypress → 預設按鈕 click → submit，title 變成 `submitted`。

## 實際
回報 `Pressed Enter.`，exit 0；頁面只收到 `keydown:Enter`、`keyup:Enter`，沒有 keypress/click/submit，表單沒有送出。

## 替代方法
`cdp evalraw <t> Input.dispatchKeyEvent '{"type":"keyDown","key":"Enter","code":"Enter","windowsVirtualKeyCode":13,"text":"\r"}'` 加上 keyUp，即正常送出。

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的。做鍵盤可用性測試時，這會讓「只用鍵盤無法送出表單」被誤判成產品 bug。建議 `press` 對 Enter（以及 Space、可列印字元）帶上對應的 `text`。

### 草稿 C（新 issue，對應 T4）

**標題**：click: toggle that only changes attributes (aria-pressed / class) reports `Outcome: no-change`

## 環境
- chrome-cdp-ex: e2fa112 (2.20.0)
- Chrome: HeadlessChrome 153.0.8010.12
- OS / Node: Linux 6.8, Node v22.22.3

## 重現
1. 最小頁面：`<button aria-pressed="false" onclick="this.setAttribute('aria-pressed','true');this.style.background='black'">A</button>`
2. `cdp click <t> button`（`--js` 也一樣）

## 預期
`Outcome: changed`（AX tree 中 pressed 狀態改變、樣式改變）。

## 實際
`Outcome: no-change. Next: cdp perceive <t> -C -d 8`；`eval` 讀到 aria-pressed 已是 true。

## 替代方法
用 `eval` 讀屬性確認。

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的。篩選按鈕、切換鈕常只改 pressed/selected 狀態；回報 no-change 會讓人誤以為「點了沒反應」。建議 settle diff 納入 AX 狀態（pressed、checked、selected、expanded）的變化。

### 草稿 D（新 issue，proposal，對應 T9）

**標題**：[proposal] viewport: report success when the size is applied instead of `Verdict: investigate`

## 環境
- chrome-cdp-ex: e2fa112 (2.20.0)；Chrome HeadlessChrome 153；Linux 6.8 / Node 22.22.3

## 重現
1. 任一頁面 `cdp viewport <t> 800x600`

## 目前做法
回報約 20 行，含 `Outcome: no-change — No visible AX tree change observed after action.`、`Verdict: investigate`、`Blocking signals: fresh-perception-needed`；但尺寸其實已套用。

## 建議
viewport 的成功條件改為「讀回的尺寸 = 要求的尺寸」，回報一行 `Viewport: 800x600 (DPR 1)` 即可；AX diff 只在有變化時附上。

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的（手機尺寸切換很頻繁）。

### 草稿 E（新 issue，proposal，對應 T6）

**標題**：[proposal] netlog: accept `--all` like `console --all`, and list valid flags in the usage error

## 環境
- chrome-cdp-ex: e2fa112 (2.20.0)；Linux 6.8 / Node 22.22.3

## 重現
1. `cdp netlog <t> --all`

## 目前做法
`Kind: usage`，`Next: cdp help netlog`；要再下一個指令才知道可用旗標。

## 建議
`--all` 作為「不篩選」的別名；usage 錯誤直接列出可用旗標（`--type --url --status --id --clear`）。

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的。

## 各筆處置狀態

| 編號 | 狀態 |
|---|---|
| T1、T2、T3 | 併入既有 #549（https://github.com/EndeavorYen/chrome-cdp-ex/issues/549） |
| T4 | 草稿 C，待使用者同意（依指示未發出） |
| T5、T11 | 草稿 A，待使用者同意（依指示未發出） |
| T6 | 草稿 E，待使用者同意（依指示未發出） |
| T7 | 併入既有 #560（https://github.com/EndeavorYen/chrome-cdp-ex/issues/560） |
| T8 | 併入既有 #552 第 5 點（https://github.com/EndeavorYen/chrome-cdp-ex/issues/552） |
| T9 | 草稿 D，待使用者同意（依指示未發出） |
| T10 | 草稿 B，待使用者同意（依指示未發出） |
