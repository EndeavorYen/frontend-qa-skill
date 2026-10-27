# 2026-10-27 MCP skill，PR #48 最終 head（`a66a9d4`）

- skill：`frontend-qa` @ `a66a9d4`（相對上一輪 `ee63ccf` 只改遮罩：預設遮罩、放行類採允許清單；新增識別字放行類、路徑片段可帶 `@`／`.` 前綴、console 依中文標點切 token；預設的不透明規則沒有放寬）
- 驅動：chrome-devtools-mcp 1.2.0 的 MCP 工具（MCP server 自己開的 headed Chrome 156）。探測 `scripts/probe.mjs` 用文件的 9222 設定：另一個 Chrome（headless）以 `--remote-debugging-port=9222` 和專用設定檔啟動，`CDP_PORT=9222`，Node 22
- 種子站：`PORT=4173 node evals/seeded-app/server.mjs`，Node 20，開跑前重新啟動。整輪沒有重啟；後端資料會累積
- 深度 3，視窗 1280×800 與 390×844（390 用 `emulate`）
- 登入：MCP 這邊沿用分頁裡已登入的工作階段；深連結測試清掉 storage 後，帳號用 `fill_form`，密碼在作業系統鍵盤層輸入到已聚焦的密碼欄，值在 shell 內產生。探測的密碼從 `QA_PASSWORD` 讀。沒有密碼出現在工具參數、設定檔或紀錄
- 每個 `evaluate_script` 回傳都經過 `__frontendQaMaskResult`（例外見「限制」）；每次整頁載入、reload、`emulate` 之後先重裝腳本再 evaluate
- 產出：[probe.json](2026-10-27-mcp-skill-pr48-final-artifacts/probe.json)、[probe-result.json](2026-10-27-mcp-skill-pr48-final-artifacts/probe-result.json)。這輪沒有另寫 report／findings／ux-review／repro，計分依據是下表的探測結果和 MCP 讀回值
- 稽核：沒有讀 app 原始碼。沒有建立或留言 issue

## 前後對照

| 指標 | 2026-10-27 MCP（`ee63ccf`） | **本次（`a66a9d4`）** |
|---|---|---|
| 瀏覽器驅動 | MCP 工具 + 探測（9222） | MCP 工具 + 探測（9222） |
| 總抓到率 | 21/21 | **21/21** |
| P0+P1 抓到率 | 5/5 | **5/5** |
| 假陽性 | 0 | **0** |
| 工具呼叫 | 約 120（MCP 約 100；探測 2 次） | **約 70**（MCP 63；探測 1 次；其餘是啟動與登入的 Shell） |
| 其中重裝 mask／checkpoint | 14 + 0 次失敗 | **7 + 2 次因未重裝而失敗** |
| 時間 | 約 10 分 | **約 6 分**（runner 時鐘 12:26–12:32 UTC+8） |
| Tokens | 沒有數字 | **沒有數字** |
| 漏掉 | 無 | 無 |

步數口徑：從啟動 seeded server 到最後一次 MCP 呼叫，含 Shell；寫本檔和 commit 不計。這輪只跑測試輪的核對，沒有做體檢、Critic 報告和 repro 檔，所以步數和時間比上一輪少，不能當成效率進步。

## 計分

| # | 抓到 | 證據 |
|---|---|---|
| B1 | ✅ | 探測 double-submit；MCP 連點兩次 → POST ×2（2/2） |
| B2 | ✅ | 390×844 空白送出出現錯誤後，按鈕 713–754、固定 footer 從 724 起、高 120，`elementFromPoint` 中線與下緣都打到 FOOTER，頁高 844 不能捲（2/2）；未出錯時按鈕 676–716 |
| B3 | ✅ | 探測 stuck-loading（500 與離線）；MCP 列表 API 回 500 → 5.5 秒後仍「載入中」、0 列（2/2） |
| B4 | ✅ | 「已取消」0 列，表格後沒有任何說明 |
| B5 | ✅ | 空白送出只出現 `P.error`「發生錯誤」，`:invalid` 0、`aria-invalid` 0 |
| B6 | ✅ | 設定改值按「儲存」，`list_network_requests` 沒有任何 XHR／fetch；重新開啟 `#/settings` 回到 10／true（2 次儲存都沒有請求） |
| B7 | ✅ | 探測：`div.icon-btn` 鍵盤到不了、沒有名稱 |
| B8 | ✅ | 確認框按 Esc 仍開著，焦點 BODY；用「取消」關掉，沒有刪除 |
| B9 | ✅ | 「建立訂單」4px；登出與篩選 12px |
| B10 | ✅ | 探測 low-contrast：`span.hint` 1.56:1 |
| B11 | ✅ | 探測 390 寬 `#/orders/3` scrollWidth 536 |
| B12 | ✅ | 探測 `#/orders/3` TypeError（reading 'trim'）；MCP 備註欄空白 |
| B13 | ✅ | 填三欄 → `navigate_page back` → `forward` → 5 欄長度全 0，沒有提示 |
| B14 | ✅ | 「已完成」篩選仍列出待處理（2/2） |
| B15 | ✅ | `#/orders/2`、`#/orders/3` h1 是「工單 #n」 |
| B16 | ✅ | 數量 -3、單價 100 → 小計 NT$ -300 → 建立 `#/orders/6`，數量 -3 |
| B17 | ✅ | 清 storage 後開 `#/orders/2` → `#/login` → 登入後在 `#/orders` |
| B18 | ✅ | 點「已完成」後 reload → pressed 回到「全部」，網址沒有篩選參數 |
| B19 | ✅ | `#/orders/999` → h1「工單 #undefined」、「NT$ 非數值」、狀態「undefined」；console 404 + `Uncaught (in promise)` |
| B20 | ✅ | 探測 no-feedback（離線送出）；MCP 讓 POST reject → 1.5 秒後網址、畫面不變，沒有可見錯誤，按鈕仍可按（2/2） |
| B21 | ✅ | `#/help`、`#/contact` 都是「找不到頁面」 |

- 總抓到率：21/21。P0+P1：5/5（B1、B2、B3、B6、B20）
- 假陽性：0
- 題外：探測仍看到送出時 API 500 跳到 `#/orders/undefined`「找不到頁面」

## 遮罩在這輪的表現

- 上一輪被遮掉的可讀值這次都留著：`工單 #undefined`、`#/orders/undefined`、`網址：http://localhost:4173/#/orders/undefined`（中文冒號後的網址單獨解析）
- 仍然過遮的地方：確認框文字「刪除訂單 #5？」回傳成「刪除訂單 #<masked len=2>」。`#5` 單獨留著，後面接 `？` 或 `?` 時整段遮掉。不是密值，不影響計分
- 呼叫端的 key 含字根時整段遮：回傳物件用 `sessionKeys` 當欄位名，裡面的鍵名 `user` 被遮。這是 key 規則照設計運作，不是 value 規則的問題

## 方法差異與限制

- **n=1**，只跑一次
- **不是隔離的 run，也不是黑箱發現**：runner 開跑前讀過上一輪結果檔，裡面有每個 bug 的觸發方式，這輪實際上是照已知清單逐條核對。21/21 只說明遮罩改動後這些檢查仍讀得到需要的值，不能當成 skill 抓 bug 能力的數字
- 沒有跑新手／亂點／設計師等完整測試輪、體檢、Critic，也沒有寫 repro 檔；Playwright 沒裝
- 2 次 `evaluate_script` 在整頁載入後還沒重裝 mask 就執行：一次回傳了未經遮罩的字串（內容是篩選狀態和列數，沒有密值），一次因為 `__frontendQaMaskResult` 不存在而報錯，重裝後重做
- 第一次用 MCP `click` 送出負數訂單時沒有發出 POST，畫面出現「發生錯誤」；改在 `evaluate_script` 裡對同一顆按鈕 `.click()` 後才送出。原因沒有查明
- 設定頁用 `navigate_page reload` 檢查時，瀏覽器的表單還原讓欄位顯示剛改的值；改成重新開啟網址才看到真正回到 10／true
- 探測和 MCP 不是同一個瀏覽器（MCP server 是既有連線，沒有改成 `--browser-url`），checkpoint 和登入狀態不共用
- 探測對帳號欄 selector 仍誤報明文密碼
- 沒有測：詳情頁 API 失敗、登入 API 斷網
