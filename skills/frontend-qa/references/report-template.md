# 產出格式

## coverage.md

```markdown
# 覆蓋地圖

| # | 畫面 / 流程步驟 | URL | 新手 | 亂點 | 設計師 | 小螢幕鍵盤 | 惡劣環境 | 狀態 | 體檢 | 備註 |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | 登入 | /login | ✅ | ✅ | ✅ | ⛔ T2 | ✅ | ✅ | ✅ | 狀態：權限不適用（未登入頁）。證據：亂點→shots/S1-double-click.png |
| S2 | 建立訂單 / 步驟 1 | /orders/new | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | |
| S3 | 設定 | /settings | ➖ 使用者縮小範圍 | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | |
| P1 | 流程：建立訂單 | /orders/new → /orders | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ 流程列不做體檢 | |

## 既有資料抽樣
| 型態 | 抽樣 | console |
|---|---|---|
| 狀態：草稿 / 已發佈 | #101 / #102 | #101 → 無；#102 → 無 |
| 選填欄位「標籤」缺漏 | #117 | #117 → TypeError: Cannot read properties of null（F5） |
```

欄位只放開啟的測試輪；`體檢` 有開的話放最後一欄，只對畫面列做，流程列標 `➖`。

格子的值只能是以下四種：`☐`、`✅`、`➖ <理由>`、`⛔ <工具軌編號>`。增量模式的「複驗」欄另外可以是 `✅ 探測`（沒改動，而且探測沒有新的 console 或失敗請求，見 [memory.md](memory.md#步驟-1)）。

`✅` 只代表那一輪跑完，不必每格附證據。清掉的檢查（懷疑過、決定不記成問題）才要證據。每一列只有一個「備註」欄，寫在那一欄，不另開欄：`證據：<輪次>→<路徑>`。路徑是 `shots/` 的截圖、重現腳本，或 `probe-result.json` 的那一筆。同一列多筆用 `；` 隔開，例如 `證據：亂點→shots/S1-double-click.png；惡劣環境→probe-result.json 的 no-feedback`。上面 S1 只有「亂點」是清掉的檢查，其他 `✅` 沒有路徑。若每一格 `✅` 都要一條路徑，一張地圖會多出幾十筆，而且常常要多拍截圖，會吃掉看圖額度，卻不會改變「這一輪跑完」這個決定，所以不做。

## findings.md

每發現一個問題就新增一筆。編號用 `F1`、`F2`…，合併重複問題時保留最小的編號。

```markdown
### F7 [P1][斷點] 手機版送出按鈕被固定 footer 擋住

- 畫面：S2 建立訂單 / 步驟 1（`/orders/new`）
- 輪次：小螢幕鍵盤
- 視窗：390x844
- 重現：
  1. 以 qa-user 登入，前往 `/orders/new`
  2. 填完所有欄位
  3. 捲動到底部
- 預期：可以點擊「送出」
- 實際：「送出」被 footer 蓋住一半，點擊時點到 footer 的連結
- 證據：`shots/F7-footer-overlap.png`；chrome-cdp-ex 的 `click` 回報 `Kind: covered`
- 重現次數：2/2
- 重播：`repro/F7.actions.json`（replay 通過，flow 斷言失敗，符合預期）
- 重現腳本：`repro/F7.spec.ts`（目前失敗，符合預期）
- 相關：F3（同一個 footer 在 S5 也擋住內容）
```

P3 問題可以省略「預期」和「重現次數」，但截圖不能省。「重播」和「重現腳本」只有 P0、P1 需要，寫法見 [repro.md](repro.md#驗證腳本)。沒有 Playwright 時，重現腳本寫 `repro/F7.spec.ts`（未執行：沒有 Playwright），重播仍然要跑。

## unattributed.md

```markdown
### U1 點擊「匯出」後沒有下載，也沒有錯誤

- 畫面：S6
- 試過：`click`（Outcome: no-change）、`click --js`（同樣沒有反應）、`click --expect-download`（逾時）
- 為什麼判斷不出來：可能是下載被瀏覽器設定擋住，也可能是按鈕本身壞掉
- 證據：`shots/U1-export.png`（或重現腳本路徑，或 `probe-result.json` 的那一筆）
- 下一步：`click <t> @14`（只有這一筆是因為指令或重現失敗才寫時才需要，而且只能有一條可執行指令）
- 需要使用者：手動點一次，看看是否會下載
```

每一筆都要有「證據」。沒有證據就還沒有結論。

## report.md

```markdown
# 前端品質驗證報告：<app 名稱 / 範圍>

## 環境檢查
- chrome-cdp-ex：<package.json version>（commit <短 SHA 或未知>，<origin 或 https://github.com/EndeavorYen/chrome-cdp-ex>）
- doctor readiness：ready / usable-with-warnings / blocked
- checks：每項一行，`<label>：<status> — <detail>`
- Chrome：<navigator.userAgent，有分頁後填>

## 範圍
- 日期、環境、URL、測試帳號（只寫身分，不寫密碼）
- 範圍與縮小的部分
- 禁止動作
- 視窗尺寸
- 深度與面項
- 執行模式：單一 session 或分 session；完整，或增量（上次：<執行目錄>）；入口：完整 / audit / critique / advise
- 成本：估算約 n turns、n 分鐘、US$n；實際 n turns、n 分鐘（實際值由交付時填寫，拿不到時寫「未知」）；讀進對話的截圖 n 張 / 上限 n 張（畫面數 × 尺寸數 × 主題數）

## 已知問題狀態（增量模式時才有）
| 編號 | 畫面 | 等級 | 標題 | 上次 | 這次 |
|---|---|---|---|---|---|
| 2026-10-06-myapp/F3 | S4 | P2 | 匯出的 CSV 檔名是亂碼 | 仍存在 | 已修 |

這次新發現 n 筆，寫在下面的清單。

## Critic
- 方式：子代理 / 主 session 自查
- Critic 的判定：成立 n、部分成立 n、不成立 n、待確認 n；待確認經主 session 處理後：成立 n、移出報告 n（詳見 `critic-verdicts.md`）

## 摘要
- 嚴重度：P0 ×n、P1 ×n、P2 ×n、P3 ×n（增量模式時分兩欄：這次新發現 / 仍存在的已知問題）
- 覆蓋率：✅ n / ➖ n / ⛔ n（總共 n 格）；增量模式時另列「複驗」✅ n / ➖ n
- 一句話結論：這個 app 目前最大的問題是什麼

## 最嚴重的 5 個問題
1. F7 [P1][斷點] … — 一句話說明影響
2. …

## UI/UX 體檢摘要
- 整體 n / 5；最低分的畫面：S2（n）
- 最值得做的 3 項改善（完整內容見 `ux-review.md`）：
  1. …

## 完整清單（按畫面分組）
### S2 建立訂單
- F7 [P1][斷點] …
- F12 [P3][UI] …

## 未歸因
- U1 …（需要使用者確認的事項）

## 工具軌摘要
- 工具問題 n 筆、摩擦 n 筆，issue 連結見步驟 5
```

完整清單只列編號、等級和標題；細節放在 `findings.md`，不要在兩個地方各寫一份。

## audit.md

`audit` 才寫。沒有測試輪，也沒有 1–5 分。每一列都要有 check 名稱和元素；沒有單一元素的 check（例如 `console-error`），元素欄寫錯誤訊息裡看得到的函式或頁面位置，不能留空。

```markdown
# 設計稽核

- 入口：audit
- 畫面：S3 建立訂單（未指定畫面時，列出這次稽核的全部畫面）
- 測試輪：無
- 探測：沿用 `.frontend-qa/state/probe.json` / 這次新寫的 `probe.json` / 已跳過（原因）

| 畫面 | check | 元素 | 說明 |
|---|---|---|---|
| S3 建立訂單 | placeholder-as-label | `input[name=customer]` "客戶名稱" | 有 placeholder，沒有 label |
| S3 建立訂單 | small-target | `button.icon` "刪除" 28x28 | `probe-result.json` |
```

同一筆 check 加同一個元素只留一列。超過門檻不一定就是錯；不成立的不要寫進這張表，理由可以放在該畫面的備註，不要另開測試輪。

## advise.md

`advise` 才寫。不開瀏覽器，不寫程式碼或 CSS。每項都是設計系統層級的改法，並列出影響的畫面、改動前後、預期哪些維度可以到幾分。

```markdown
# 設計系統建議

來源：`.frontend-qa/2026-10-06-myapp/ux-review.md`、`.frontend-qa/2026-10-06-myapp/findings.md`、`.frontend-qa/2026-10-08-myapp/audit.md`（缺的檔案寫明沒有）

## 字級 7 種 → 定一套 5 級字級表

- 影響的畫面：S2 訂單列表、S4 建立訂單
- 改動前：量化檢查字級 7 種（12、13、14、16、18、20、24px）
- 改動後：只留 12 / 14 / 16 / 20 / 28 五級
- 預期：一致性 3 → 4，視覺層級 3 → 4

## 三種按鈕圓角 → 統一成 token

- 影響的畫面：S2、S3、S5
- 改動前：主要按鈕 4px、次要按鈕 12px、卡片 8px
- 改動後：按鈕圓角收成一個 token，卡片另用一個
- 預期：一致性 2 → 4
```
