# 探測腳本

有些檢查不需要判斷，只要照固定步驟做、看結果就好，例如 console 有沒有錯誤、文字對比夠不夠、連點送出會不會發出兩個請求。這些交給 [`scripts/probe.mjs`](../scripts/probe.mjs) 一次跑完，agent 只負責寫設定檔和解讀結果。這樣可以少掉很多 turns，工具的原始輸出也不會留在對話紀錄裡。

## 什麼時候跑

步驟 1 的覆蓋地圖完成後、步驟 2 開始前跑一次。步驟 0 已經確認 chrome-cdp-ex v2.21.0 以上和 Node 22。另外需要同時符合：
- 知道 `CDP_PORT`，或在 `probe.json` 寫了 `cdpPort`
- 至少開了一個測試輪，或入口是 `audit`

不符合的話就跳過，改由測試輪用 chrome-cdp-ex 手動檢查，並在 `report.md` 寫明沒有跑探測及原因。不要改用其他瀏覽器工具。

## 設定檔

寫在執行目錄的 `probe.json`。內容全部來自步驟 1 偵察時在畫面上看到的東西（網址、欄位、按鈕），不要讀 app 的原始碼。

```json
{
  "base": "http://localhost:3000",
  "viewports": ["1440x900", "390x844"],
  "publicPages": ["/#/login"],
  "login": {
    "url": "/#/login",
    "fill": { "[name=email]": "qa@example.com", "[name=password]": { "env": "QA_PASSWORD" } },
    "submit": "form button"
  },
  "pages": ["/#/projects", { "url": "/#/projects/new", "anchor": "h1:新增專案" }, "/#/settings"],
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
| `login` | 登入步驟；不需要登入就省略。密碼寫成 `{ "env": "QA_PASSWORD" }`，不能寫明文 |
| `pages` | 覆蓋地圖中的每個畫面。可以是網址字串，或 `{ "url": "/#/orders", "anchor": "h1:訂單列表" }`。`anchor` 是 `標籤:文字`，載入後必須看得到這個文字完全相同的元素 |
| `records` | 既有資料抽樣中每一組抽到的那一筆的詳情頁（見 [state-checklist.md](state-checklist.md#既有資料抽樣)） |
| `lists` | 會呼叫 API 載入的列表，`api` 是在 netlog 看到的請求網址片段 |
| `forms` | 會送出資料的表單。`fill` 是 selector 和值，`api` 是送出時的請求網址片段，`longField` 用來測超長輸入 |

**`allowSubmit: true` 只能在步驟 0 允許建立資料時才設。** 送出類檢查會真的送出表單，而且連點檢查可能建立兩筆資料。沒有設的表單只做頁面檢查。探測腳本不會按刪除，也不會碰付款、寄信這類按鈕；不要把這類表單放進 `forms`。

**設定檔不能出現明文密碼**，規則和 [repro.md](repro.md) 相同。密碼欄位寫成 `{ "env": "QA_PASSWORD" }`，這個物件只能有一個 `env` 鍵。`probe.mjs` 讀設定檔時把它換成該環境變數的值。變數不存在或是空字串時，腳本直接停止（exit code 2），stderr 印出要設定的變數名稱，不會連上瀏覽器，也不會帶空密碼登入。解析只發生在記憶體裡，不會把密碼寫回 `probe.json`。密碼欄位若仍是字串，stderr 印出警告（不含密碼內容）並繼續。`QA_PASSWORD` 要事先放在環境變數裡，不要寫在指令上，否則密碼會留在對話紀錄。email 這類非密碼欄位仍直接寫值。

可選欄位：

| 欄位 | 預設 | 內容 |
|---|---|---|
| `forms[].method` | 所有寫入方法 | API 500 情境要攔截的 HTTP 方法，例如 `PUT`。預設攔截 GET、HEAD、OPTIONS 以外的全部方法，所以不會真的寫到後端 |
| `feedbackMs` | 5000 | 送出後等多久才判斷有沒有回饋 |
| `settleMs` | 600 | 每次載入後至少等多久 |
| `commandTimeoutMs` | 15000 | 單一 CDP 指令的逾時，超過就記一筆 `probe-error`，繼續下一項。建立連線和登入階段逾時、或 CDP 連線中斷時，直接停止並寫出目前的結果 |
| `errorWords`、`loadingWords` | 中英文常見字詞 | 判斷錯誤訊息和載入中的正規表示式 |
| `isolate` | `true` | 在隔離的 browser context 中執行；設成 `false` 會共用使用者瀏覽器的 cookie 和登入狀態 |
| `cdpPort` | — | 沒有設定環境變數 `CDP_PORT` 時才用 |

## 執行

`<skill 目錄>` 見 [SKILL.md](../SKILL.md#名詞)。

```bash
CDP_PORT=<port> node <skill 目錄>/scripts/probe.mjs .frontend-qa/<run>/probe.json --out .frontend-qa/<run>/probe-result.json
```

stdout 只有一行摘要（各檢查的筆數），完整結果在 `probe-result.json`。`pages` 和 `records` 會多一個 `fingerprints` 物件：鍵是設定檔裡的 url，值是 `{ hash, list }`，在第一個尺寸載入完成後計算，演算法在 [`scripts/fingerprint.mjs`](../scripts/fingerprint.mjs)。

- 腳本預設開一個隔離的 browser context（獨立的 cookie 和儲存空間），在裡面開分頁，跑完就關掉。所以它不會沿用使用者已經登入的狀態，需要登入的網站一定要寫 `login`；也不會登出或改動使用者其他分頁的登入狀態
- 斷網和 mock 都會還原。頁面跳出 `alert` 時，腳本記下文字當成回饋；跳出 `confirm` 時一律按取消，那一項記成 `skipped`（送出前要求確認的表單，送出類檢查要由測試輪手動做）
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
| `anchor-missing` | `pages` 寫了 `anchor` 時，第一個尺寸載入後找不到該標籤與文字。網址沒變，但內容已經不是那個畫面（例如被導回登入頁） |
| `skipped`、`probe-error` | 略過的檢查和腳本本身的錯誤，不是產品問題 |
| `multiple-primary-buttons` | 同一區塊有兩顆以上一樣重的實心按鈕。條件見 [anti-patterns.md](anti-patterns.md) |
| `placeholder-as-label` | 輸入框只用 placeholder，沒有 label |
| `generic-dialog-actions` | 問句對話框的按鈕只有「確定 / 取消」這類泛用詞 |
| `color-only-status` | 只用顏色點區分狀態，沒有文字 |
| `gray-on-color` | 灰字放在彩色背景上 |
| `nested-cards` | 卡片裡又包卡片 |
| `centered-long-text` | 長段落置中 |
| `empty-state-no-action` | 空狀態只有「無資料」，沒有下一步 |
| `vague-error` | 錯誤訊息只有「發生錯誤」 |
| `destructive-looks-primary` | 破壞性按鈕和主要按鈕外觀相同 |
| `text-checks-skipped` | 頁面不是 UTF-8。不是產品缺陷。這四個 check 的 CJK 樣式沒有跑，英文樣式仍有跑。空結果只代表英文樣式沒中，不能當成 CJK 文案沒問題 |

這 10 個 check 的程式只在 [`scripts/anti-patterns.js`](../scripts/anti-patterns.js)。手動重跑見 [ux-review.md](ux-review.md#反模式檢查)。每個命中列的元素寫成 `selector "可見文字"`。頁面的 `document.characterSet` 不是 UTF-8 時，腳本回傳 `warning`，探測記一筆 `text-checks-skipped`。CJK 樣式略過，英文樣式仍檢查。跑完探測後，把這次的 `probe.json` 複製到 `.frontend-qa/state/probe.json`。`audit` 看到這份就直接用，見 [modes.md](modes.md#audit)。

## 解讀結果

- 每一筆結果都要判斷是不是真的問題，再寫進 `findings.md`。證據寫 `probe-result.json` 中的那一筆，以及畫面代號。例如 `small-target` 會列出所有小於 44px 的元素，要合併成一筆，不要一個元素一筆
- 同一個問題出現在多個尺寸或多個頁面時，合併成一筆
- P0、P1 照證據規則，仍然要用 chrome-cdp-ex 從乾淨狀態重現兩次。做法是 `restore <t> --file .frontend-qa/<run>/checkpoint.json --format json`，再 `perceive <t>`。測試輪中途 app 自己登出時，`restore` 把 session 寫回 storage，頁面仍停在 `#/login`；先 `reload <t>` 再 `perceive <t>`，頁面才會讀到還原後的 session。
- `probe-error` 記到工具軌或 `unattributed.md`。寫進 `unattributed.md` 的每一筆都要有證據，至少一種：`shots/` 的截圖路徑、重現腳本，或 `probe-result.json` 的那一筆（見 [report-template.md](report-template.md#unattributedmd)）。對應的檢查改回測試輪手動做
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
