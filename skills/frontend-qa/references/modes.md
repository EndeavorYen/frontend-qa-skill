# 單獨入口

步驟 0 已經確認 URL、帳號、環境、禁止動作、深度、視窗、分 session、Critic、工具軌。這份文件只在入口不是 `完整` 時用。沒指定就是 `完整`，留在 SKILL.md 的步驟 1–6。

三種入口都沿用 `.frontend-qa/state/`。不修改程式碼，也不產生 CSS patch。不改 7 個維度和分數錨點。

## 三種入口

| 入口 | 做什麼 | 不做什麼 | 產出 |
|---|---|---|---|
| `audit [畫面…]` | 探測、量化檢查、可自動偵測的反模式 | 測試輪、主觀評分 | `audit.md`，每筆附 check 名稱和元素 |
| `critique <畫面…>` | 每個指定畫面把主要任務操作一次，再做 7 個維度評分與反模式比對 | 其他畫面、其他測試輪 | `ux-review.md`（格式不變，見 [ux-review.md](ux-review.md#ux-reviewmd-格式)） |
| `advise` | 讀最近一次的 `ux-review.md`、`findings.md`、`audit.md`，整理成設計系統層級的改版建議 | 開瀏覽器 | `advise.md` |

`critique` 仍然要實際操作一次。體檢規則規定評分要根據實際操作的體驗，不能只看截圖。

成本用 [depth.md](depth.md#單獨入口) 的公式，寫進 `report.md`，並告訴使用者。使用者在場就等確認；無人值守就直接開始。

## audit

畫面可以不指定。沒指定就從導覽列、選單、頁面內連結收集範圍內的畫面，不要為了收集而去跑測試輪。

1. 建立執行目錄 `.frontend-qa/<YYYY-MM-DD>-<slug>/`。`report.md` 開頭寫上步驟 0 的項目，加上 `入口：audit` 和 `測試輪：無`。
2. 寫 `probe.json`。有 `.frontend-qa/state/probe.json` 時直接複製那份來用，不要重寫畫面清單：
   ```bash
   cp .frontend-qa/state/probe.json .frontend-qa/<run>/probe.json
   ```
   使用者指定的畫面若不在這份設定裡，只改執行目錄裡的複本，把那個 URL 加進 `pages`。沒有 `state/probe.json` 時，照 [probe.md](probe.md) 用畫面上看到的網址、欄位、按鈕新寫一份。不要讀 app 的原始碼。密碼欄位寫成 `{ "env": "QA_PASSWORD" }`，不能寫明文。跑探測之前先設定環境變數 `QA_PASSWORD`（名稱以設定檔裡的 `env` 為準）。沒有設定或是空字串時，探測會停止並印出變數名稱，不會帶空密碼登入。
3. 跑探測。條件和指令見 [probe.md](probe.md#執行)。`audit` 不受「至少開了一個測試輪」限制。環境不符合就在 `report.md` 寫明原因，改用 chrome-cdp-ex 的 `eval` 對每個畫面、每個尺寸跑 [ux-review.md](ux-review.md#量化檢查) 的量化程式和 [反模式檢查](ux-review.md#反模式檢查)。
4. 探測有跑時，反模式 check 已經在結果裡。量化檢查（字級、字重、顏色、圓角、44px、橫向溢出）再對每個畫面、每個尺寸跑一次 ux-review.md 的量化程式：`eval <t> "<程式>"`。同一個 check 加同一個元素只留一筆。
5. 這些 check 只看當下 DOM。對話框、toast、送出後才出現的錯誤，停在畫面初始狀態時不會出現。`audit` 不要為了把它們點出來而改跑測試輪。
6. 確認過的問題寫進 `audit.md`，格式見 [report-template.md](report-template.md#auditmd)。不要寫 `coverage.md`，不要寫測試輪的 `findings.md`，不要寫 `ux-review.md`，不要打主觀分數。
7. 不跑 Critic。有開瀏覽器且工具軌開啟時，仍照 [tool-track.md](tool-track.md) 記錄工具問題；收尾回報仍要等使用者同意才發 issue。

完成條件：`audit.md` 每一列都有 check 名稱和元素，沒有空白的元素欄；檔案裡沒有測試輪名稱（新手、亂點、設計師、小螢幕鍵盤、惡劣環境、狀態）；沒有 1–5 分的主觀評分。`report.md` 寫明 `測試輪：無`。

## critique

`<畫面…>` 必填。只處理這些畫面。

1. 建立執行目錄。`report.md` 開頭寫 `入口：critique`、指定畫面、`測試輪：無`。
2. 沒有 `.frontend-qa/state/design-context.md` 時，先照 [memory.md](memory.md#設計背景) 建立。已經有就沿用，不要重問。
3. 用導覽找到指定畫面的 URL。不要把其他畫面談進體檢。
4. 每個指定畫面做這三件事，然後才評下一個畫面：
   - 把這個畫面的主要任務實際操作一次（點擊、輸入，不是只看截圖）。看到的缺陷寫進 `findings.md`，格式見 [report-template.md](report-template.md#findingsmd)。不要為了找缺陷再加一輪。
   - 在深度的每個視窗尺寸跑一次量化程式和反模式程式（[ux-review.md](ux-review.md#量化檢查)、[ux-review.md](ux-review.md#反模式檢查)）。
   - 照 [ux-review.md](ux-review.md) 打 7 個維度（不是「輕」的單一整體分），並對照 [anti-patterns.md](anti-patterns.md)。「質感」和「文案」的評論要引用設計背景。
5. 寫 `ux-review.md`。格式不要改，只放這次指定的畫面。
6. 不寫測試輪欄位，不寫 `coverage.md`。
7. 步驟 0 同意 Critic 時，只驗證這次寫進 `findings.md` 的項目，照 [critic.md](critic.md)。不要補測其他畫面。沒有同意就自查，規則相同。
8. 分 session 時只派一個體檢子 session，帶入的內容見 [sessions.md](sessions.md#主-session-做什麼)。

完成條件：`ux-review.md` 只有指定畫面；每個畫面的評論寫得出這次操作主要任務時看到的結果；7 個維度都有分數；3 分以下有證據；有最值得做的 5 項改善；「質感」和「文案」引用了設計背景。沒有其他畫面的分數，也沒有測試輪紀錄。

每個畫面的 turns 要低於完整模式同一個畫面的「開啟的測試輪數 × 每格 turns + 每畫面體檢 turns」的一半，見 [depth.md](depth.md#單獨入口)。

## advise

不開瀏覽器。不跑探測，不操作畫面。

1. 建立執行目錄。`report.md` 開頭寫 `入口：advise`。
2. 讀最近的三份檔案。`.frontend-qa/state/runs.md` 由新到舊找；沒有 `runs.md` 就用執行目錄名稱排序。`ux-review.md`、`findings.md`、`audit.md` 各自取最近一次有出現的那份。缺的在 `advise.md` 開頭寫明沒有，不要為了補這份檔案而開瀏覽器。
3. 有 `state/design-context.md` 就讓建議符合裡面的目標使用者和品牌形容詞。沒有就不要為了 advise 去問，也不要推測。
4. 把各畫面的建議依共同原因歸類，寫進 `advise.md`，格式見 [report-template.md](report-template.md#advisemd)。例如「字級 7 種 → 定一套 5 級字級表」「三種按鈕圓角 → 統一成 token」。每項都要有：影響的畫面、改動前、改動後、預期哪些維度可以到幾分。
5. 只寫建議。不寫程式碼、不寫 CSS、不產生 patch。

完成條件：`advise.md` 至少有一項（三份來源都空著時，寫明沒有可歸類的建議，並列出找過的路徑）；每一項都有影響的畫面、改動前、改動後、預期分數；沒有 CSS 或程式 patch。

## 收尾

三種入口都做步驟 6 的交付，內容改成這次的產出：

- `audit`：`audit.md` 的路徑、check 筆數、沒有測試輪
- `critique`：體檢總分和前 3 項改善建議、`ux-review.md` 的路徑
- `advise`：建議的標題、`advise.md` 的路徑

交付前更新 `.frontend-qa/state/`，見 [memory.md](memory.md#結束前更新狀態檔)。這次有寫 `probe.json` 的，複製到 `.frontend-qa/state/probe.json`。`runs.md` 的模式欄寫 `audit`、`critique` 或 `advise`。
