# 2026-10-08 skill-depth1

- skill：`frontend-qa` @ `7c90222`，安裝在巢狀 agent 的工作目錄 `.cursor/skills/frontend-qa`
- 執行：Cursor agent `agent -p --trust --force --model grok-4.7-high --output-format stream-json`。模型是 grok-4.7 high。工作目錄在 repo 外的空目錄。app 在 `:56706`，headless Chrome 在 `:56707`（提示詞裡的 port 跟 v2 的 `:4173` / `:9444` 不同，因為這台機器上要避開同時在跑的評測）
- 深度 1，面項用該深度預設：亂點、惡劣環境、體檢（輕）、工具軌。桌機 1440×900
- 成本：154 turns（`run.jsonl` 裡 `tool_call` 且 `subtype=completed` 的筆數；`started` 也是 154，沒有未完成的呼叫）、28.9 分鐘（`duration_ms` 1,734,704）、US$ 沒有。這個 runner 不提供金額，改記 token：input 511,719、output 90,298、cache read 14,489,856、cache write 0
- skill 自己估算：約 43 turns、7 分鐘、US$2.0（另外 Critic 約 10 turns）。覆蓋地圖 12 列 × 2 輪 = 24 格，體檢 7 個畫面
- 誤差（實際 − 估算）/ 估算：turns +258%（(154 − 43) / 43）、分鐘 +313%（(28.9 − 7) / 7）。US$ 沒有實際值，不算誤差
- 產出：[report](2026-10-08-skill-depth1-artifacts/report.md)、[findings](2026-10-08-skill-depth1-artifacts/findings.md)、[ux-review](2026-10-08-skill-depth1-artifacts/ux-review.md)、[coverage](2026-10-08-skill-depth1-artifacts/coverage.md)、[tool-track](2026-10-08-skill-depth1-artifacts/tool-track.md)、[prompt](2026-10-08-skill-depth1-artifacts/prompt.txt)、[metrics](2026-10-08-skill-depth1-artifacts/metrics.json)
- 稽核：沒有讀取 app 原始碼（`fetch` / `view-source` / `document.scripts` 的 grep 是 0）。console 堆疊裡的 `app.js:192` 是瀏覽器印出來的。`gh issue create` / `gh issue comment` 的字樣出現在提示詞和 `gh issue view` 拉回來的內文，沒有執行建立或留言

| # | 抓到 | 對應 F 編號 | 等級差距 | 備註 |
|---|---|---|---|---|
| B1 | ✅ | F1 | 0 | 連點兩次 `.click()`，兩筆 POST。報 P0 |
| B2 | ❌ | | | 深度 1 只有桌機，沒有測 390 寬，頁尾蓋住送出沒有出現 |
| B3 | ✅ | F2 | 0 | API 500 與離線都停在「載入中…」。報 P1 |
| B4 | ✅ | F11 | 0 | 「已取消」只有表頭 |
| B5 | ✅ | F8 | 0 | 空白送出只顯示「發生錯誤」 |
| B6 | ✅ | F14 | 0 | 重新整理後名稱回到 `qa-user`，沒有 API。2 秒的「已儲存」toast 沒有寫進報告，和先前 grok 評測一樣 |
| B7 | ✅ | F6 | 0 | `div.icon-btn`，沒有可讀名稱，Tab 到不了 |
| B8 | ½ | F12 | 0 | 有寫 Esc 關不掉；沒有寫焦點沒有移進對話框 |
| B9 | ❌ | | | 沒有比較主要 / 次要按鈕圓角 |
| B10 | ✅ | F7 | 1（報 P2） | `#c8c8c8` 對比 1.56:1。答案卷是 P3 |
| B11 | ❌ | | | 列表截斷（F18）不是詳情卡片被長名稱撐破 |
| B12 | ✅ | F4 | 0 | 打開 #3，`trim` TypeError，備註空白而不是「（無備註）」 |
| B13 | ✅ | F16 | 0 | 填到一半按上一頁和重新整理，內容消失、沒有提示。沒有單獨按「取消」 |
| B14 | ✅ | F10 | 1（報 P1） | 「已完成」仍列出待處理。答案卷是 P2 |
| B15 | ✅ | F17 | 0 | 詳情標題「工單」 |
| B16 | ✅ | F9 | 0 | 數量 0、1.5 和負單價都存成訂單，小計可為負。沒有單獨送數量 `-3` |
| B17 | ❌ | | | 沒有測登入後是否回到原本的深層連結 |
| B18 | ❌ | | | 沒有測重新整理後篩選是否回到「全部」 |
| B19 | ✅ | F15 | 0 | `#/orders/999` 為「工單 #undefined」「NT$ 非數值」 |
| B20 | ✅ | F5 | 1（報 P2） | 離線送出 5 秒內沒有反應。答案卷是 P1。F3 是 API 500 跳到 `#/orders/undefined`，不是這一條 |
| B21 | ✅ | F13 | 0 | 登入後「說明」「聯絡我們」都是「找不到頁面」。沒有單獨寫頁面上沒有返回連結 |

## 指標

- 總抓到率：15.5 / 21 = **74%**
- P0+P1 抓到率：4 / 5 = **80%**（B1、B3、B6、B20 有；B2 沒有）。深度 1 守住了 P0，沒有守住全部 P1：漏掉的是只有手機版才會被頁尾擋住的送出按鈕
- 等級差距：0 級 13 個、1 級 3 個（只算有抓到的；½ 的 B8 等級一致）
- 假陽性：沒有逐條再證。F3（建立時 HTTP 500 進到 `#/orders/undefined`）、F18（列表長名稱被截斷且沒有 title）、F19（文字連結高度低於 24px）、F20（刪除 API 500 時對話框關掉、列還在、沒有錯誤）都是看得到的現象，先不算假陽性
- 體檢命中率：不適用。深度 1 的體檢是「輕」，`ux-review.md` 每個畫面只有一個整體分數，沒有答案卷 X1–X7 用的 7 個維度
- 低於下限數：不適用（同樣沒有維度分數，無法對 L1–L9）
- 改善命中率：3 / 4。第 1 項含欄位驗證和防止重複送出（Y1、Y2）；第 2 項含列表錯誤與重試、第 3 項含空的「已取消」（Y3）。前 5 項沒有手機版固定 footer（Y4）

## 工具軌

共 3 筆：bug 2 筆、摩擦 1 筆。新 issue 草稿 2 份，另有 1 份留言草稿指向既有 issue，都還沒有發出。未歸因檔是空的。
