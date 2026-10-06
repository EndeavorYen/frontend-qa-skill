# 探測腳本

有些檢查不需要判斷，只要照固定步驟做、看結果就好，例如 console 有沒有錯誤、文字對比夠不夠、連點送出會不會發出兩個請求。這些交給 [`scripts/probe.mjs`](../scripts/probe.mjs) 一次跑完，agent 只負責寫設定檔和解讀結果。這樣可以少掉很多 turns，工具的原始輸出也不會留在對話紀錄裡。

## 什麼時候跑

步驟 1 的覆蓋地圖完成後、步驟 2 開始前跑一次。需要同時符合：
- 用 chrome-cdp-ex（或其他 CDP 工具）驅動瀏覽器，而且知道 `CDP_PORT`
- `node --version` 是 22 以上
- 至少開了一個測試輪

不符合的話就跳過，照原本的測試輪手動檢查，並在 `report.md` 寫明沒有跑探測及原因。

## 設定檔

寫在執行目錄的 `probe.json`。內容全部來自步驟 1 偵察時在畫面上看到的東西（網址、欄位、按鈕），不要讀 app 的原始碼。

```json
{
  "base": "http://localhost:3000",
  "viewports": ["1440x900", "390x844"],
  "publicPages": ["/#/login"],
  "login": {
    "url": "/#/login",
    "fill": { "[name=email]": "qa@example.com", "[name=password]": "…" },
    "submit": "form button"
  },
  "pages": ["/#/projects", "/#/projects/new", "/#/settings"],
  "records": ["/#/projects/12", "/#/projects/40"],
  "lists": [{ "url": "/#/projects", "api": "/api/projects" }],
  "forms": [
    {
      "url": "/#/projects/new",
      "fill": { "[name=title]": "QA 測試", "[name=budget]": "100" },
      "submit": "button[type=submit]",
      "api": "/api/projects",
      "longField": "[name=title]",
      "allowSubmit": true
    }
  ]
}
```

| 欄位 | 內容 |
|---|---|
| `base` | 網站根網址 |
| `viewports` | 依深度的預設尺寸 |
| `publicPages` | 登入前檢查的頁面，例如登入頁 |
| `login` | 登入步驟；不需要登入就省略 |
| `pages` | 覆蓋地圖中的每個畫面 |
| `records` | 既有資料抽樣中每一組抽到的那一筆的詳情頁（見 [state-checklist.md](state-checklist.md#既有資料抽樣)） |
| `lists` | 會呼叫 API 載入的列表，`api` 是在 netlog 看到的請求網址片段 |
| `forms` | 會送出資料的表單。`fill` 是 selector 和值，`api` 是送出時的請求網址片段，`longField` 用來測超長輸入 |

**`allowSubmit: true` 只能在步驟 0 允許建立資料時才設。** 送出類檢查會真的送出表單，而且連點檢查可能建立兩筆資料。沒有設的表單只做頁面檢查。探測腳本不會按刪除，也不會碰付款、寄信這類按鈕；不要把這類表單放進 `forms`。

可選欄位：

| 欄位 | 預設 | 內容 |
|---|---|---|
| `forms[].method` | 所有寫入方法 | API 500 情境要攔截的 HTTP 方法，例如 `PUT`。預設攔截 GET、HEAD、OPTIONS 以外的全部方法，所以不會真的寫到後端 |
| `feedbackMs` | 5000 | 送出後等多久才判斷有沒有回饋 |
| `settleMs` | 600 | 每次載入後至少等多久 |
| `commandTimeoutMs` | 15000 | 單一 CDP 指令的逾時，超過就記一筆 `probe-error`，繼續下一項 |
| `errorWords`、`loadingWords` | 中英文常見字詞 | 判斷錯誤訊息和載入中的正規表示式 |
| `isolate` | `true` | 在隔離的 browser context 中執行；設成 `false` 會共用使用者瀏覽器的 cookie 和登入狀態 |
| `cdpPort` | — | 沒有設定環境變數 `CDP_PORT` 時才用 |

## 執行

```bash
CDP_PORT=<port> node <skill 目錄>/scripts/probe.mjs .frontend-qa/<run>/probe.json --out .frontend-qa/<run>/probe-result.json
```

stdout 只有一行摘要（各檢查的筆數），完整結果在 `probe-result.json`。

- 腳本預設開一個隔離的 browser context（獨立的 cookie 和儲存空間），在裡面開分頁，跑完就關掉。所以它不會沿用使用者已經登入的狀態，需要登入的網站一定要寫 `login`；也不會登出或改動使用者其他分頁的登入狀態
- 斷網和 mock 都會還原。頁面跳出 `alert`、`confirm` 時，腳本記下文字當成回饋，一律按取消
- 某一項出錯時只記一筆 `probe-error`，其他項目照樣跑完；登入失敗時會直接停止，因為之後的頁面都會變成在檢查登入頁

## 檢查項目

| check | 做法 |
|---|---|
| `console-error` | 每個頁面和每筆抽樣資料，在每個尺寸下都重新載入，收集 exception 和 `console.error` |
| `failed-request` | 同上，收集 4xx、5xx 和失敗的請求 |
| `horizontal-overflow` | 頁面寬度大於視窗寬度；`longField` 填入 300 個字元的無空格字串後也會檢查一次 |
| `small-target` | 可點的元素寬或高小於 44px |
| `low-contrast` | 文字和背景的對比低於 4.5:1（大字低於 3:1）。背景是圖片、漸層或半透明時算不準，文字色不是 `rgb()` 格式時略過 |
| `not-keyboard-reachable` | 游標是手指、但不是連結或按鈕，也沒有 `tabindex` 的元素 |
| `no-accessible-name` | 控制項沒有文字、`aria-label` 或 label；只有符號（例如 emoji）的可點元素也算 |
| `stuck-loading` | 列表 API 回 500，或離線後重新進入列表，等 `feedbackMs` 之後還顯示「載入中」，而且沒有錯誤訊息 |
| `double-submit` | 填好表單，在同一瞬間 `.click()` 兩次，寫入請求超過一個 |
| `no-feedback` | 離線或 API 回 500 時送出，畫面和網址都沒有任何變化 |
| `no-error-message` | 同上，畫面有變化，但沒有出現錯誤訊息（例如直接跳到別的頁面） |
| `skipped`、`probe-error` | 略過的檢查和腳本本身的錯誤，不是產品問題 |

## 解讀結果

- 每一筆結果都要判斷是不是真的問題，再寫進 `findings.md`。證據寫 `probe-result.json` 中的那一筆，以及畫面代號。例如 `small-target` 會列出所有小於 44px 的元素，要合併成一筆，不要一個元素一筆
- 同一個問題出現在多個尺寸或多個頁面時，合併成一筆
- P0、P1 照證據規則，仍然要用 chrome-cdp-ex 從乾淨狀態重現兩次
- `probe-error` 記到工具軌或 `unattributed.md`，對應的檢查改回測試輪手動做
- 在覆蓋地圖的備註寫「探測：<check 名稱>」，表示這一格已經有哪些檢查做過了

## 測試輪不用重做的部分

探測只檢查設定檔列出的頁面、在設定的尺寸下、剛載入時的狀態。這個範圍內做過的檢查，測試輪不必再做一次。範圍以外的仍然要做：沒列進設定檔的頁面和尺寸（例如深度 4 的 `320x568`），以及操作之後才出現的狀態（打開的對話框、選單、錯誤訊息、展開的列表）。

| 測試輪 | 探測已經做過 | 測試輪仍然要做 |
|---|---|---|
| 亂點 | 連點送出 | 狂點其他按鈕、上一頁、重新整理、同時開多個分頁、奇怪的輸入 |
| 設計師 | 對比、44px 點擊目標 | 對齊、間距、一致性、視覺層級 |
| 小螢幕鍵盤 | 橫向溢出、鍵盤到不了的元素、沒有名稱的控制項 | Tab 順序、焦點樣式、對話框焦點、固定元素遮擋 |
| 惡劣環境 | 列表 500 / 離線、表單離線 / 500 送出 | 慢速網路、逾時、時鐘、401 / 403 |
| 狀態 | 每筆抽樣資料的 console | 抽樣資料的畫面內容、編輯畫面、空狀態、權限 |

探測沒有涵蓋的表單或列表（例如沒有寫進 `forms` 的），測試輪照原本的方式做。
