# 工具軌（chrome-cdp-ex）

- chrome-cdp-ex: e2fa112（https://github.com/EndeavorYen/chrome-cdp-ex.git）
- Chrome: HeadlessChrome/153.0.8010.12；Node v22.22.3；Linux 6.8
- doctor: `CDP: 127.0.0.1:9444 → HeadlessChrome/153.0.8010.12`

## 原始紀錄（測試中即時記錄）
- raw1: `nav C23F http://localhost:4173` 回 `Error: The daemon did not return a validated Action Result ... Transport: awaiting-response/peer-end: Connection closed before response`，exit 1；但緊接的 perceive 顯示頁面已到 `/#/login`。導覽其實成功。
- raw2: `shot C23F shots/S1-login.png`（相對路徑）→ `Error: ENOENT: no such file or directory, open 'shots/S1-login.png'`，Kind: unknown；改用絕對路徑成功。commands.md 寫 elshot 的 [file] 是 "relative to your cwd"。
- raw3: perceive 後接 shot/eval，再 fill @1 → 'Unknown ref: @1. No refs have been assigned in this daemon yet'，daemon 疑似中途重啟、ref 遺失（無任何重啟提示）。改用 CSS selector。
- raw4: 登入頁 `fill C23F 'input[type=text]'` 第一次因 daemon 斷線（同 raw1）沒填入；之後 `input[type=text]` 找不到元素是因為 input 沒寫 type 屬性（產品寫法，非工具問題）。
- raw5: `perceive -C` 的 [Visible controls] 把 number input 列為 `input role=textbox "textbox"`，名稱一律是 "textbox"；同一份輸出的 AX 樹卻有正確的 `[spinbutton] 數量`。兩段資訊不一致，也無法從 Visible controls 分辨欄位。
- raw6: 建立訂單頁 `click C23F 'button[type=submit], button.btn-primary'` 回報 `Outcome: no-change`，但接著 perceive 顯示已導到 /#/orders/4（訂單已建立）。回報不實：實際有導覽與資料寫入。
- raw7: 建立訂單迴圈中，一次 `fill`（客戶名稱）又出現 ambiguous-action-completion / Connection closed（同 raw1），之後指令自動恢復；檢查訂單 #6 客戶名有填入。截至此處 daemon 斷線 3 次。
- raw8: `nav` 到 /#/orders 後立刻 `text C23F table` → 'no element matched'；幾秒後同一指令成功。疑似 nav 對 hash 路由回傳時 SPA 還沒渲染完，text 也不等待元素出現（click/fill 會等 2 秒，text 不會）。
- raw9: 先 perceive，再 eval，再 click '[data-del="7"]'，之後 `perceive --since-action` 印出 '(no action baseline available; run perceive before a mutating command...)'，但明明 click 前有 perceive。
- raw10: 又一次 'No refs have been assigned in this daemon yet'：perceive -i 之後下一個指令 click @3 就失效（中間沒有其他指令）。daemon 在兩個 CLI 呼叫之間無聲重啟，ref 全丟。
- raw11: 設定頁 `fill 'input[name=name]'` 又遇 daemon 斷線（ambiguous-action-completion），第 4 次。
- raw12: 設定頁 `select` 也遇 daemon 斷線（第 5 次）；但值有被選上（之後 eval 讀到 50）。
- raw13: `wait C23F 5000` 也遇 daemon 斷線（Kind: daemon-disconnect，第 6 次）。
- raw14: 設定頁 click 儲存再次 daemon 斷線（第 7 次）。觀察：斷線幾乎都發生在「停頓一段時間後的第一個指令」，疑似 daemon 閒置逾時關閉與新連線競態。
- raw15: 登入流程 click 登入時 daemon 斷線（第 8 次），前兩個 fill 剛成功、中間沒有停頓，所以不只是閒置逾時。
- raw16: `reload` 遇 daemon 斷線（第 9 次），用 window 標記確認：這次斷線的 reload 是否生效無法判斷；第二次 reload 正常回報。
- raw17: 先前 `dialog C23F dismiss`（回報 Auto-accept: OFF），經過幾次 daemon 斷線重啟後，`dialog C23F` 顯示 'Auto-accept: ON'。dialog 模式在 daemon 重啟後無聲恢復成預設 accept——若使用者靠 dismiss 防止誤刪，重啟後的 confirm() 會被自動按下確定。
- raw18: 同 raw6 第二次：送出訂單 `click` 回報 'Outcome: no-change'，實際導到 /#/orders/16。可穩定重現於「按鈕觸發 hash 路由跳轉」。
- raw19: `viewport C23F 800x600` 遇 daemon 斷線（第 10 次）。
- raw20: `scroll C23F "to bottom"`（一個引號參數）→ 'Error: Direction required: down, up, left, right, x,y, or to top/to bottom'。錯誤訊息列出的正是我傳的值；要拆成兩個參數 `to bottom` 才行，訊息沒說明。
- raw21: `overlay` 回報 fixed footer 擋住按鈕時，Next 建議 `dismiss-modal`——footer 不是 modal，這個建議無效；`click` 遇 covered 時 Next 建議 `--js`，在 QA 情境會繞過使用者實際會遇到的阻擋（工具有在 Error 寫清楚，但 Next 直接給繞過指令）。
- raw22: [重要] `press C23F Enter` 在登入表單的密碼欄按 Enter，頁面收到 keydown 'Enter'，但沒有觸發 form submit（隱式送出）。用 `evalraw Input.dispatchKeyEvent` 帶 `text: "\r"` 的 keyDown 就會送出並登入。press 回報 'Pressed Enter.'，沒有任何警告。差點被誤判成產品「Enter 不能登入」。
- raw23: [重要] `netlog --clear` → `reload` → `netlog` 回 'No network requests captured'，但 `performance.getEntriesByType('resource')` 顯示頁面載入時有 `fetch:/api/orders`。偵察時也因此誤判「app 不打 API」。

## 整理後紀錄

統計：工具 bug 7 筆（T1–T7）、摩擦 5 筆（T8–T12）。原始紀錄 raw1–raw23 對應如下。

### T1 [bug] tab daemon 在指令中或指令之間結束：`Connection closed before response` / `Unknown ref`
- 指令：各種（`nav`、`fill`、`select`、`click`、`reload`、`viewport`、`wait`）
- 實際：這次 QA 中至少 10 次 `ambiguous-action-completion`（raw1、7、11、12、13、14、15、16、19），以及 2 次 `Unknown ref ... No refs have been assigned in this daemon yet`（raw3、raw10）。有時動作已生效（raw12 select、raw11 fill），有時沒有（raw4 fill），只能每次用 `eval` 讀回確認
- 替代方法：改用 CSS selector、每個動作後 `eval` 驗證
- 影響：沒有造成 ⛔；但每格成本明顯增加
- 去重：**與 #549 相同**（同版本 e2fa112、同 Linux 6.8 / Node 22.22.3，已於 2026-10-06 關閉並修正）。本次不另開 issue
- 處置：併入 #549（https://github.com/EndeavorYen/chrome-cdp-ex/issues/549）

### T2 [bug] daemon 重啟後，`dialog dismiss` 模式無聲恢復為預設 accept
- 指令：`dialog <t> dismiss` → （數次 T1 重啟）→ `dialog <t>`
- 預期：保留 dismiss，或至少在下一個動作的回報中警告「dialog 模式已重設」
- 實際：`dialog <t>` 顯示 `Auto-accept: ON`（raw17），前面沒有任何提示。若使用者用 dismiss 來防止誤按 `confirm("刪除？")`，重啟後的刪除確認會被自動接受
- 替代方法：每次危險動作前重新下 `dialog <t> dismiss` 並 `dialog <t>` 讀回
- 同類：重啟也清掉 refs（raw3、raw10）、`--since-action` baseline（raw9）、netlog 緩衝（T5 可能相關）。這部分 #549 只處理「不要重啟」與「Unknown ref 時說明重啟」，沒有涵蓋 dialog 模式
- 去重：搜尋 `dialog mode`、`dialog dismiss reset` 無結果 → 新 issue 草稿 D1

### T3 [bug] 按鈕觸發非同步 hash 路由跳轉時，`click` 回報 `Outcome: no-change`（回報不實）
- 指令：`click <t> 'main button.btn-primary'`（表單送出鈕；按下後約 800ms POST 完成才改 `location.hash`）
- 預期：`Outcome: changed`，或回報「導覽在 settle 之後發生」
- 實際：回報 `Clicked <BUTTON> "送出訂單". Outcome: no-change. Next: cdp perceive ... -C -d 8`，但 `eval location.hash` 已是 `#/orders/16`，資料也已寫入（raw6、raw18，另有 3 次相同）
- 替代方法：`click` 後 `sleep` 1 秒再 `eval location.hash`
- 去重：#552（OPEN）第 1 點要求 `no-change` 改為非零退出碼；本例是反方向：動作確實成功卻回報 no-change。若依 #552 把 no-change 當失敗，這種情況會被誤判成失敗並觸發重試 → 重複建立資料。準備留言草稿 C1

### T4 [bug] `press <t> Enter` 不會觸發表單的隱式送出（implicit submission）
- 指令：焦點在 `<form>` 內的密碼欄（form 內有 `type=submit` 按鈕）時 `press <t> Enter`
- 預期：表單送出（真實鍵盤會）
- 實際：頁面收到 `keydown Enter`，但沒有 `submit` 事件；回報 `Pressed Enter.` 沒有警告。改用 `evalraw <t> Input.dispatchKeyEvent '{"type":"keyDown","key":"Enter","code":"Enter","windowsVirtualKeyCode":13,"text":"\r"}'` 就會送出（raw22）。推測 `press` 送出的 keyDown 沒帶 `text: "\r"`，Chrome 因此不產生 keypress / 隱式送出
- 影響：差點把產品記成「Enter 無法登入」的 a11y 問題
- 去重：搜尋 `press Enter submit`、`implicit submit`、`Enter keypress` 無相同 → 新 issue 草稿 D2

### T5 [bug] `netlog` 漏掉頁面自己發出的 fetch
- 指令：`netlog <t> --clear` → `reload <t>` →（頁面載入時 `fetch('/api/orders')`）→ `netlog <t>`；以及在 SPA 內點擊造成的 `POST /api/orders`、`GET /api/orders/19`
- 預期：列出這些 fetch
- 實際：`No network requests captured`；同時 `performance.getEntriesByType('resource')` 與自行包裝的 `window.fetch` 都看到請求。但用 `eval "await fetch('/api/orders')"` 發出的請求有被 netlog 收到（raw23）
- 替代方法：在頁面中包裝 `window.fetch` 記錄方法、網址、狀態
- 可能與 T1 有關（daemon 重啟時清空緩衝或晚於請求掛上 Network domain），無法排除
- 去重：netlog 相關 issue 皆為輸出格式與遮罩，沒有「漏抓」→ 新 issue 草稿 D3

### T6 [bug] `shot <t> <相對路徑>` 失敗：ENOENT
- 指令：`shot <t> shots/S1-login.png`（cwd 底下有 `shots/`）
- 實際：`Error: ENOENT: no such file or directory, open 'shots/S1-login.png'`，`Kind: unknown`；絕對路徑成功（raw2）。commands.md 對 elshot 寫「relative to your cwd」
- 去重：#526 是 elshot 不能指定檔名（已修），不同 → 新 issue 草稿 D4

### T7 [bug] `perceive --since-action` 說沒有 baseline，但動作前有 perceive
- 實際：`perceive -C -d 8` → `eval` → `click` → `perceive --since-action` 印出 `(no action baseline available; run perceive before a mutating command…)`（raw9）
- 判斷：極可能是 T1 重啟清掉 baseline；併入 T1 / #549，不另報

### T8 [摩擦] `[Visible controls]` 把 number input 列為 `input role=textbox "textbox"`
- 實際：同一份輸出 AX 樹有 `[spinbutton] 數量`，但 Visible controls 每個欄位名稱都叫 `"textbox"`，無法分辨（raw5）
- 建議：沿用 AX 名稱與角色（spinbutton / 標籤文字）
- 去重：無相同 → 草稿 D5（proposal）

### T9 [摩擦] `nav` 到 hash 路由後立刻 `text <t> <sel>`，元素還沒渲染就失敗
- 實際：`text <t> table` → `no element matched`，稍後同指令成功（raw8）。`click` / `fill` 會等 2 秒，`text` 不會
- 建議：`text <sel>` 也套用 `--wait-ms`
- 去重：無相同 → 併入 D5 一起提（同一份 proposal 的第二點）

### T10 [摩擦] 阻擋者是固定 footer 時，`overlay` 的 Next 建議 `dismiss-modal`；`click` 的 Next 建議 `--js`
- 實際：footer 不是 modal，`dismiss-modal` 沒有用；`--js` 會繞過使用者真的會遇到的阻擋（raw21）。Error 行本身寫得很清楚
- 建議：阻擋者不是 dialog/overlay 時，Next 改為「捲動 / 調整 viewport / 這可能是產品問題」；QA 情境下不要把 `--js` 當第一建議
- 去重：#146 是「fixed 目標被當成自己的阻擋者」，不同 → 草稿 D6（proposal）

### T11 [摩擦] `scroll <t> "to bottom"`（一個參數）被拒絕
- 去重：**與 #560 相同**（已於 2026-10-05 修正，本版本 e2fa112 較舊）→ 併入 #560，不另報

### T12 [摩擦] `fill` 不接受 `--`（end of options）
- 實際：`fill <t> sel -- "-3"` → `fill: unknown argument --`；直接 `fill <t> sel "-3"` 可以（raw 迴圈中）。影響小
- 處置：不報（影響小，直接傳負數可用）

## Issue 草稿

> 依使用者指示：**只寫草稿，不發出**。所有草稿已去除被測網站資訊（網址、帳號、資料、截圖）。

### D1（新 issue）`dialog: dismiss mode silently resets to accept after the tab daemon restarts`

```markdown
**標題**：dialog: dismiss mode silently resets to accept after the tab daemon restarts

## 環境
- chrome-cdp-ex: e2fa112
- Chrome: HeadlessChrome 153.0.8010.12
- OS / Node: Linux 6.8 / Node v22.22.3

## 重現
1. 開一個有「刪除」按鈕、按下會 `confirm()` 的最小 HTML 頁
2. `cdp dialog <t> dismiss` → 回報 `Auto-accept: OFF`
3. 讓 tab daemon 重啟（本版本在 Linux 上常因 #549 自行重啟；或 `cdp stop <t>` 後再下任一指令）
4. `cdp dialog <t>`

## 預期
仍是 dismiss；或重啟後第一個指令的回報警告「dialog mode reset to accept」。

## 實際
`No dialogs recorded. Auto-accept: ON`，之前沒有任何提示。此時點刪除鈕，confirm() 會被自動接受。

## 替代方法
每個可能觸發 confirm 的動作前重新下 `dialog <t> dismiss` 並讀回。

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的。#549 修正了 daemon 不該重啟的問題，但 daemon 仍可能因閒置逾時或瀏覽器斷線重啟；dialog 模式屬於安全相關設定，建議持久化或在重設時明示。
```

### D2（新 issue）`press Enter does not trigger implicit form submission`

```markdown
**標題**：press: Enter in a form field does not submit the form (no implicit submission)

## 環境
- chrome-cdp-ex: e2fa112
- Chrome: HeadlessChrome 153.0.8010.12
- OS / Node: Linux 6.8 / Node v22.22.3

## 重現
1. 最小 HTML：`<form id=f><input name=a><button>送出</button></form><script>f.onsubmit=e=>{e.preventDefault();document.title='submitted'}</script>`
2. `cdp click <t> 'input[name=a]'`
3. `cdp press <t> Enter`
4. `cdp eval <t> document.title`

## 預期
`submitted`（與真實鍵盤相同）。

## 實際
頁面收到 `keydown` Enter，但沒有 `submit` 事件；回報 `Pressed Enter.`。

## 替代方法
`cdp evalraw <t> Input.dispatchKeyEvent '{"type":"keyDown","key":"Enter","code":"Enter","windowsVirtualKeyCode":13,"text":"\r"}'` 會送出。推測 `press` 的 keyDown 沒帶 `text`。

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的。鍵盤可及性測試時，這會讓人誤判「網站的 Enter 不能送出表單」。
```

### D3（新 issue）`netlog misses fetches issued by the page`

```markdown
**標題**：netlog: page-initiated fetch() calls are not captured (eval-initiated ones are)

## 環境
- chrome-cdp-ex: e2fa112
- Chrome: HeadlessChrome 153.0.8010.12
- OS / Node: Linux 6.8 / Node v22.22.3

## 重現
1. 一個 hash 路由 SPA：載入時 `fetch('/api/items')`，按鈕 `fetch('/api/items',{method:'POST'})` 後改 `location.hash`
2. `cdp netlog <t> --clear` → `cdp reload <t>` → 等 1 秒 → `cdp netlog <t>`
3. 在頁面上點按鈕送出 → `cdp netlog <t>`
4. 對照：`cdp eval <t> "performance.getEntriesByType('resource').map(r=>r.name)"`

## 預期
netlog 列出 GET 與 POST。

## 實際
`No network requests captured`；performance entries 有這些請求。`cdp eval <t> "await fetch('/api/items')"` 發出的請求則會出現在 netlog。

## 替代方法
在頁面中包裝 `window.fetch` 自行記錄。

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的。同一段時間 tab daemon 常重啟（#549），可能是重啟後才掛上 Network domain；若是如此，建議 netlog 在緩衝因重啟而清空時明示。
```

### D4（新 issue）`shot <t> <relative path> fails with ENOENT`

```markdown
**標題**：shot: a relative output path fails with ENOENT (resolved against the daemon cwd?)

## 環境
- chrome-cdp-ex: e2fa112
- Chrome: HeadlessChrome 153.0.8010.12
- OS / Node: Linux 6.8 / Node v22.22.3

## 重現
1. `mkdir -p shots`
2. `cdp shot <t> shots/a.png`

## 預期
寫到 `./shots/a.png`（commands.md 對 elshot 寫 "relative to your cwd"）。

## 實際
`Error: ENOENT: no such file or directory, open 'shots/a.png'`，`Kind: unknown`。

## 替代方法
傳絕對路徑。

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的。
```

### D5（新 issue）`[proposal] perceive Visible controls names and text wait`

```markdown
**標題**：[proposal] perceive -C: Visible controls should use AX role/name; text <sel> should wait like click/fill

## 環境
- chrome-cdp-ex: e2fa112

## 目前做法
1. `perceive -C -d 8` 的 AX 樹顯示 `[spinbutton] 數量`，但 `[Visible controls]` 同一個元素顯示 `input role=textbox "textbox"`；表單中每個欄位都叫 "textbox"，只能回頭對 AX 樹。
2. `nav` 到 SPA 的 hash 路由後立刻 `text <t> table` → `no element matched`，稍後同指令成功；`click`/`fill` 預設等 2 秒，`text` 不等。

## 建議
1. Visible controls 用 AX 的 role 與 accessible name（label 文字）。
2. `text <t> <sel>` 支援並預設套用 `--wait-ms`。

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的。
```

### D6（新 issue）`[proposal] Next hints when the blocker is a fixed footer`

```markdown
**標題**：[proposal] overlay/click: when a non-modal fixed element blocks the target, don't suggest dismiss-modal or --js first

## 環境
- chrome-cdp-ex: e2fa112

## 目前做法
目標按鈕被 `position: fixed` 的頁尾蓋住（手機寬度、頁面無法再捲動）：
- `overlay <t> <sel>` → `blocked by [overlay] footer …`，`Next: cdp dismiss-modal <t>`（頁尾不是 modal，無效）
- `click <t> <sel>` → `Kind: covered`（訊息正確），`Next: cdp click <t> <sel> --js`

## 建議
阻擋者不是 dialog / overlay 時，Next 改為說明「這可能是頁面本身的版面問題，使用者也點不到」，並建議 `scroll` / `viewport` 檢查；`--js` 放在次要選項並註明會繞過使用者實際遇到的阻擋。

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的。這次 Error 行讓我正確判定為產品問題，但照 Next 走的 agent 會用 --js 繞過，漏報一個 P1。
```

### C1（留言 #552）

```markdown
補充一個反方向的例子（chrome-cdp-ex e2fa112，Linux，HeadlessChrome 153）：

表單送出鈕按下後，頁面約 800ms 才完成 POST 並改 `location.hash`。`click <t> <sel>` 回報 `Outcome: no-change`，但隨後 `eval location.hash` 已是新的路由，資料也已寫入（5 次中 5 次）。

如果依本 issue 第 1 點把 `no-change` 改成非零退出碼，這種「慢的成功」會被當成失敗，agent 很可能重試 → 重複送出。建議 no-change 的判定等待期能涵蓋 click 之後啟動的 fetch / 導覽，或在回報中區分「settle 期內沒變化，但仍有進行中的請求」。
```

### 收尾狀態

| 編號 | 處置 |
|---|---|
| T1 | 併入既有 #549（同版本，已修正） |
| T2 | 草稿 D1，未發出（依指示不發） |
| T3 | 留言草稿 C1（#552），未發出 |
| T4 | 草稿 D2，未發出 |
| T5 | 草稿 D3，未發出 |
| T6 | 草稿 D4，未發出 |
| T7 | 併入 T1 / #549 |
| T8、T9 | 合併為草稿 D5，未發出 |
| T10 | 草稿 D6，未發出 |
| T11 | 併入既有 #560（已修正） |
| T12 | 不報（影響小） |

依使用者事先指示（步驟 4 只寫草稿，不執行 `gh issue create` / `gh issue comment`），以上草稿交由使用者決定是否發出。
