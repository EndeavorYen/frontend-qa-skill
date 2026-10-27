# 2026-10-27 MCP-only skill，最終 head（PR #47 head `bec9b7f`）

- skill：`frontend-qa` @ `bec9b7f`（只透過 chrome-devtools-mcp 操作瀏覽器）。和 [2026-10-27-mcp-skill](2026-10-27-mcp-skill.md)（`fdbb3ed`）比，這個 head 只改了 `scripts/mask.js` 的遮罩規則（key 依 `_`、`-`、`.`、camelCase 切字後整字比對；值只有整串像憑證才遮；長文字超過 2000 字才截斷），以及 SKILL.md 對應的說明
- 驅動：chrome-devtools-mcp 1.2.0，MCP server 自己開的 headed Chrome 156（`--remote-debugging-pipe`，沒有 debug port）。所有瀏覽器動作都經 MCP 工具；沒有用 Playwright 或 CDP 腳本
- 種子站：`PORT=4173 node evals/seeded-app/server.mjs`，Node 20。整輪沒有重啟；P1 重現用 skill 的 checkpoint 還原（只還原瀏覽器 storage，後端資料會累積）
- 深度 3，面項用預設：新手、亂點、設計師、小螢幕鍵盤、惡劣環境、狀態、體檢（標準）、工具軌。視窗 1280×800 與 390×844（`emulate` viewport `390x844x3,mobile,touch`）
- 登入：帳號用 `fill` 填；密碼在作業系統鍵盤層輸入到已聚焦的密碼欄，不在任何 MCP 工具參數、steps 檔或 spec 裡。spec 讀 `process.env.QA_PASSWORD`
- 探測：沒跑。沒有 debug port。skill 允許跳過，已寫進 report
- 產出：[report](2026-10-27-mcp-skill-final-artifacts/report.md)、[findings](2026-10-27-mcp-skill-final-artifacts/findings.md)、[coverage](2026-10-27-mcp-skill-final-artifacts/coverage.md)、[ux-review](2026-10-27-mcp-skill-final-artifacts/ux-review.md)、[critic-verdicts](2026-10-27-mcp-skill-final-artifacts/critic-verdicts.md)、[tool-track](2026-10-27-mcp-skill-final-artifacts/tool-track.md)、[repro](2026-10-27-mcp-skill-final-artifacts/repro/)。截圖沒有提交
- 稽核：沒有讀 app 原始碼。沒有執行 `gh issue create` 或 `comment`。ANSWER-KEY 在跑完之後才讀

## 前後對照

| 指標 | 前：2026-10-09 grok47-catchrate | 前：2026-10-27 MCP-only（`fdbb3ed`） | 後：2026-10-27 MCP-only 最終 head（本次） |
|---|---|---|---|
| 瀏覽器驅動 | CDP 腳本（`:9444`） | chrome-devtools-mcp 工具 | chrome-devtools-mcp 工具 |
| 步數 | 126 次完成的工具呼叫 | 194 次工具呼叫（瀏覽器 MCP 166） | **約 170 次工具呼叫** |
| 其中重裝 mask／checkpoint | 不適用 | 沒有分開記 | 15 次重裝 + 2 次因沒重裝而失敗的呼叫 |
| 其中 anti-patterns 腳本 | 不適用 | 0 | **0**（深度 3 是標準體檢，只有「深」才跑） |
| Tokens | input 519,125／output 94,403／cache read 8,900,608 | 沒有數字：runner 紀錄沒有 token 計數 | 沒有數字：runner 紀錄沒有 token 計數 |
| 時間 | 34.4 分 | 13.9 分 | **約 12 分** |
| 總抓到率 | 19/21 | 19/21 | **20/21** |
| P0+P1 抓到率 | 5/5 | 4/5 | **4/5** |
| 假陽性 | 沒有記錄 | 0 | **0** |
| 漏掉 | B14、B19 | B2、B17 | B2 |

步數口徑和前一次 MCP-only 相同：runner 紀錄裡從啟動 seeded server 到寫完報告的工具呼叫，含 Shell 寫檔和讀截圖；跑完後讀 ANSWER-KEY、寫本檔、commit 不計。這次沒有逐筆標記哪些是瀏覽器 MCP，所以只給總數。時間是 runner 時鐘，從啟動 seeded server 到寫完報告。

**SKILL.md 每頁安裝 anti-patterns 的成本**：0 步。這段只在體檢「深」時執行，深度 3 不跑。實際多出來的步數來自每次整頁載入後重裝 `mask.js`／`checkpoint.js`：15 次重裝，另有 2 次 `evaluate_script` 因為頁面腳本已被清掉而失敗（一次在設定頁重新整理後，一次在 `emulate` 切到手機後，見工具軌 T2）。

## 計分

| # | 抓到 | 對應 F 編號 | 等級差距 | 備註 |
|---|---|---|---|---|
| B1 | ✅ | F6 | 1（報 P1） | 同一個 evaluate_script 連點兩次，POST ×2；乾淨狀態 2/2 |
| B2 | ❌ | | | 390×844 不捲動用 `elementFromPoint` 查「送出訂單」：按鈕 y 676–716，footer 從 y 724 起，打到 BUTTON。只報了列表最後一列被 footer 蓋住（F17，題外） |
| B3 | ✅ | F19 | 0 | 列表 500 和 401 都停在「載入中…」超過 5 秒；2/2 |
| B4 | ✅ | F9 | 1（報 P3） | 「已取消」只剩表頭 |
| B5 | ✅ | F2 | 0 | 空白送出只顯示「發生錯誤」 |
| B6 | ✅ | F11 | 0 | 顯示「已儲存」但沒有請求，header 沒變，重新整理後還原；2/2 |
| B7 | ✅ | F4 | 0 | DIV，沒有 role 和名稱，tabIndex −1 |
| B8 | ✅ | F18 | 0 | Esc 關不掉，焦點在 BODY |
| B9 | ✅ | F15 | 0 | 主要 4px、次要 12px |
| B10 | ✅ | F21 | 1（報 P2） | 對比 1.56:1 |
| B11 | ✅ | F16 | 0 | 手機 innerWidth 被撐到 536 |
| B12 | ✅ | F12 | 0 | #3 備註空白、`Uncaught (in promise)`，#1 沒有 |
| B13 | ✅ | F7 | 0 | 上一頁再下一頁，欄位全空，沒有提示 |
| B14 | ✅ | F8 | 1（報 P1） | 「已完成」列出待處理；2/2 |
| B15 | ✅ | F3 | 0 | 「工單 #n」 |
| B16 | ✅ | F5 | 0 | 數量 -3 建立訂單，小計 NT$ -300 |
| B17 | ✅ | F14 | 0 | 登出→`#/orders/2`→登入回到 `#/orders`，有截圖 |
| B18 | ✅ | F10 | 1（報 P2） | 重新整理回到「全部」 |
| B19 | ✅ | F13 | 0 | `#/orders/999` 顯示「工單 #undefined」「NT$ 非數值」 |
| B20 | ✅ | F20 | 1（報 P2） | `emulate` Offline 後送出，畫面沒有任何反應 |
| B21 | ✅ | F1 | 0 | 兩個頁尾連結都是「找不到頁面」 |

- 總抓到率：20/21 = 95%
- P0+P1 抓到率：4/5 = 80%（B1、B3、B6、B20 有；B2 沒有）
- 等級差距：0 級 14 個、1 級 6 個
- 假陽性：0。P1 從乾淨狀態各重做 2 次；P2/P3 有截圖或 evaluate 紀錄
- 題外（確實存在、答案卷沒有）：F17（手機列表捲到底，最後一列下 32px 被固定 footer 蓋住）
- 體檢：`ux-review.md` 是整個 app 一組 7 維分數。回饋 1、一致性 2、文案 2、排版節奏 3，都沒超過 X1–X7 的上限（7/7）；L1–L9 是逐畫面下限，整站分數無法對照，不適用。改善命中率 3/4（Y1、Y2、Y3；沒有 Y4）

## 方法差異與限制

- **n=1**。只跑了一次完整 black-box；增量模式沒跑
- **不是隔離的 run**：這個 runner 在前幾輪讀過 ANSWER-KEY 和舊結果檔（包括 B2、B17 被漏掉的紀錄）。本次 B17 補上截圖、B20 改用 `emulate` Offline，都可能受此影響。抓到率很可能偏高，不能當成 skill 本身的進步
- **runner 不同**：10-09 那欄是外部 runner `run.jsonl` 的計數，有 token；本次和前一次 MCP-only 是 agent runner 直接照 SKILL.md 操作 MCP 工具，紀錄裡沒有 token 計數。步數和時間口徑不同，不能直接相除
- 預設視窗：MCP 開的 headed 視窗一開始約 485px 寬，前段部分測試在這個寬度做，之後用 `resize_page` 調成 1280×800（工具軌 T1）
- 一次 Slow 3G 重新載入後的 `evaluate_script` 沒有經過 mask（只回列數和文字，沒有敏感值），記在工具軌 T4
- P1 重現：兩次批次各從同一個 checkpoint 起點開始，一個 `evaluate_script` 依序重做 F8、F19、F11、F6，不是每條各還原一次。hash 路由的 `navigate_page` 不會重新載入，app 記憶體狀態會留著（工具軌 T5）
- 沒有探測（沒有 debug port）。Playwright 沒裝，`repro/F*.spec.ts` 都沒跑
- 沒有測：詳情頁 API 失敗、登入 API 斷網
