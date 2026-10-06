# 工具軌

- 工具：chrome-cdp-ex 2bd2728；repo https://github.com/EndeavorYen/chrome-cdp-ex.git
- Chrome：HeadlessChrome/153.0.8010.12；Node v22.22.3；Linux

## 紀錄

### T1 [bug] `nav` 到會被 app 以 hash 導向的網址，回報 `Kind: timeout`，但頁面已載入完成
- 指令：`nav <t> http://localhost:4174/` 與 `nav <t> http://localhost:4174/#/orders/1`（未登入，app 把 hash 改成 `#/login`）
- 實際：`Error: Timed out waiting for navigation to finish (last readyState: complete http://localhost:4174/#/login)` / `Kind: timeout`，退出碼 1；實際上頁面已在 `#/login`，`perceive` 正常
- 替代方法：忽略錯誤，直接 `perceive` / `eval location.href`
- 重現條件：單頁 app 在初始載入時用 `location.hash=` 改寫路由（沒有新的 navigation 事件）；發生 3 次
### T2 [摩擦] 以可見文字當 target 的 `click` 一律 `JS-clicked`，無法得知真實點擊是否會被擋住
- 指令：`click <t> "送出訂單"`、`"取消"`、`"刪除"`、`"儲存"` → 回報 `JS-clicked <BUTTON>`
- 影響：QA 時想用「真人點擊」驗證按鈕是否可按，必須先 `perceive` 取 @ref 再 `click @ref`，多一步；receipt 沒說明為何改用 JS click
- 建議：receipt 說明 JS-click 的原因，或文字 target 也先做 hit-test
### T3 [摩擦] `console --errors` 每次都重複列出整個頁面生命週期累積的 Uncaught Exceptions，容易誤判成當前動作造成的
- 情境：開過 `/#/orders/3` 後，之後每個畫面的 `console --errors` 都再列同一筆例外，要手動先 `console --clear`
- 建議：`--errors` 加 `--since-action` 或預設只顯示上次讀取之後的新項目
### T4 [bug?] `netlog --id` 對 `DELETE → 204` 顯示 `Error: net::ERR_ABORTED (canceled)` 同時 Status 204
- 指令：`netlog <t> --id 12`；清單視圖顯示 `204`，詳情視圖卻多一行 Error。回應確實成功（列表少了一筆）
- 待確認是否為工具誤報；歸類先放這，收尾時視需要移到 unattributed
### T5 [bug] `press Enter` 只送出 keydown，沒有 keypress／implicit submit，表單不會送出，但回報 `Pressed Enter.`
- 指令：`fill <t> input[name=user] qa; fill <t> input[name=password] qa; press <t> Enter`
- 預期：表單送出（真實使用者按 Enter 會登入）
- 實際：回報 `Pressed Enter.`，頁面仍在登入頁。在頁面掛 capture listener 只看到 `keydown:Enter`，沒有 `keypress`、`submit`
- 替代方法：`type <t> $'\n'`（insertText 換行）→ 事件序列 `click:BUTTON`、`submit:FORM`，成功登入
- 影響：用 Enter 驗證「鍵盤送出表單」會誤判成產品問題；登入頁「Enter 送出」改以 `type` 驗證後判定為正常（沒有產品 finding）
- 發生次數：4 次
### T6 [摩擦] `mock add --body` 受 shell 單一參數長度限制（約 128KB），要模擬大量資料時 `Argument list too long`
- 情境：想用 1500 筆 JSON 模擬大量訂單，`mock add ... --body "$(cat big.json)"` 失敗（shell 層，exit 126）
- 建議：`--body-file <path>`；這次改用 500 筆（51KB）繞過

### T7 [摩擦] `viewport` 的輸出在整頁大改版時會倒出整份 perceive diff（`... and 16 more` + 多行 Added），每次切換尺寸都得自己過濾
- 情境：每個畫面在 3 個視窗尺寸之間切換，約 15 次；輸出常常 20+ 行，沒有 `--quiet`
- 建議：`viewport --quiet`（只印 `innerWidth×innerHeight`）
- 頻率：約 15 次

## 歸因說明
- 沒有 `⛔` 格：所有被工具阻擋的操作（T1、T2、T5）都有替代方法，覆蓋地圖沒有因此留空。
- 產品側誤判的自我更正：曾以為「刪除鈕沒反應」（實為對話框已開，我只讀了 `innerText` 前 300 字），重試後確認是產品正常行為，沒有記為 finding；曾以為「登入 Enter 無效」，改用 `type` 後確認產品正常，歸入 T5。

## Issue 草稿（尚未發出；等使用者逐筆同意）

> 去識別：以下內容不含被測網站的網址、帳號、資料或截圖。搜尋既有 issue（含已關閉）的結果寫在每筆開頭。

### 草稿 A — 留言在既有 issue #576（T5）
- 去重結果：`press: Enter does not trigger implicit form submission`（#576，狀態 CLOSED，2026-10-06 06:08 UTC 關閉）。本次在同版 `2bd2728 (2.20.0)`、HeadlessChrome 153、Linux 仍重現，`origin/main` 的 HEAD 也是 `2bd2728`，看起來關閉時尚未合併修正。
- 留言草稿：
  > 在 chrome-cdp-ex `2bd2728`（= 目前 `origin/main`）、HeadlessChrome 153.0.8010.12、Linux、Node 22.22.3 仍可重現：單頁 app 的登入表單，`fill` 兩個欄位後 `press <t> Enter` 回報 `Pressed Enter.`，但頁面只收到 `keydown:Enter`（capture listener），沒有 `keypress`、`submit`，仍停在登入頁。`type <t> $'\n'` 可以成功送出（事件序列 `click:BUTTON`、`submit:FORM`）。這次是在前端 QA 的鍵盤檢查中再次遇到，會讓「Enter 能不能送出表單」被誤判成產品問題。請確認 #576 是否該重開，或修正尚未合併。

### 草稿 B — 新 issue（T1）
- 去重結果：搜尋 `Timed out waiting for navigation hash`、`navigation timeout readyState complete` → 只有 #347、#144（皆已關閉，主題是 `Page.navigate` 逾時與 nav 速度），沒有 hash 路由改寫的案例。
- **標題**：`nav: reports Kind: timeout when a hash-router app rewrites location.hash right after load, although readyState is complete`
- 環境：chrome-cdp-ex `2bd2728`；HeadlessChrome 153.0.8010.12；Linux 6.8 / Node 22.22.3
- 重現：
  1. 一個單頁 app，載入 `/` 後由腳本把 hash 改成 `#/login`（未登入守衛）；`cdp nav <t> http://localhost:PORT/` 或 `.../#/orders/1`（未登入）
  2. 觀察 exit code 與輸出
- 預期：`Ready state: complete` 並印出最終 URL，exit 0
- 實際：`Error: Timed out waiting for navigation to finish (last readyState: complete http://localhost:PORT/#/login)` / `Kind: timeout` / `Next: cdp status <t>`，exit 1；`perceive` 立即可用，頁面其實已完成
- 替代方法：忽略錯誤，直接 `perceive` 或 `eval location.href`
- 背景：前端 QA 時發現；本次發生 3 次。

### 草稿 C — 新 issue（T4）
- 去重結果：搜尋 `netlog ERR_ABORTED 204` → 只有 #204（無關，press 的 Next 建議）。
- **標題**：`netlog --id: a successful 204 No Content response is shown with "Error: net::ERR_ABORTED (canceled)"`
- 環境：同草稿 B
- 重現：
  1. 任一頁面執行 `cdp eval <t> "fetch('/some-endpoint',{method:'DELETE'}).then(r=>r.status)"`，伺服器回 204 且無 body
  2. `cdp netlog <t>` 看清單；再 `cdp netlog <t> --id <N>`
- 預期：詳情只顯示 `Status: 204 No Content`
- 實際：清單顯示 `→ 204 (0ms, 0B)`，詳情卻多一行 `Error: net::ERR_ABORTED (canceled)`；`fetch` 的 promise 正常 resolve 204，頁面行為也正確
- 影響：QA 時會誤以為請求被取消；重現 2/2
- 備註：低嚴重度，可能是 Chrome 對無 body 回應送出 `loadingFailed(canceled)`，建議在 netlog 以 HTTP status 為準、忽略成功回應的 canceled。

### 草稿 D — 留言在既有 issue #552（T2）或新 proposal
- 去重結果：搜尋 `click JS-clicked text` → #552（OPEN，field report：receipts 不可信、wishlist），主題相近但沒有提到「以可見文字當 target 時一律 JS-click、略過 hit-test」。建議以留言併入；若維護者想獨立追蹤再開新 issue。
- 草稿：
  > `[proposal]` 以可見文字當 target 的 `click`（例如 `click <t> "Submit"`）回報 `JS-clicked <BUTTON> "Submit"`，不經過 hit-test；同一個按鈕用 `click <t> @ref` 則會偵測到 `Kind: covered`（被 `position:fixed` 頁尾蓋住）並拒絕送出真實點擊。目前做法：QA 時每個按鈕都要先 `perceive` 取 @ref 再 `click @ref`，才能知道使用者點不點得到。建議：receipt 說明為何改用 JS click，或文字 target 也先做 hit-test，失敗時才 fallback 並標註 `hit-test skipped`。本次約 12 次遇到。

### 草稿 E — 新 proposal（T3）
- 去重結果：搜尋 `console --errors exceptions repeated` → 無結果。
- **標題**：`[proposal] console --errors: only show entries since the last read / last action`
- 目前做法：頁面累積的 Uncaught Exceptions 會在之後每一次 `console <t> --errors` 重複列出，每個畫面前要手動 `console <t> --clear`，漏做一次就會把前一個畫面的例外誤認成目前畫面的。
- 建議：`--since-action`（或預設只顯示上次讀取後的新項目）。
- 頻率：本次 QA 約 25 次。

### 草稿 F — 新 proposal（T6）
- 去重結果：搜尋 `mock --body-file` → 無結果。
- **標題**：`[proposal] mock add: accept --body-file for large response bodies`
- 目前做法：`mock add "**/api/list" --body "$(cat big.json)"` 在 body 超過約 128KB 時 shell 報 `Argument list too long`；只好把測試資料縮小到 50KB。
- 建議：`--body-file <path>`。
- 頻率：1 次（但「大量資料」是 QA 狀態檢查的固定項目）。

### 草稿 G — 新 proposal（T7）
- 去重結果：未另外搜尋（與草稿 E 同類 UX 摩擦；發出前再搜 `viewport quiet`）。
- **標題**：`[proposal] viewport: add --quiet to skip the perceive diff dump`
- 目前做法：`viewport <t> 390x844` 後印出 20+ 行 diff；多尺寸巡檢時要 `| tail -1`。
- 建議：`--quiet` 只印最終尺寸。頻率：約 15 次。

## 狀態
| 編號 | 去向 | 狀態 |
|---|---|---|
| T1 | 草稿 B（新 issue） | 草稿，待使用者同意 |
| T2 | 草稿 D（併入 #552） | 草稿，待使用者同意 |
| T3 | 草稿 E | 草稿，待使用者同意 |
| T4 | 草稿 C | 草稿，待使用者同意 |
| T5 | 草稿 A（留言 #576） | 草稿，待使用者同意 |
| T6 | 草稿 F | 草稿，待使用者同意 |
| T7 | 草稿 G | 草稿，待使用者同意 |

依無人值守規則，沒有發出任何 issue 或留言。
