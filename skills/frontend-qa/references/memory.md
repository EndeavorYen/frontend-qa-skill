# 跨次記憶與增量模式

同一個 app 測第二次時，覆蓋地圖、既有資料的型態、已知的問題，大部分都和上次一樣。跨次記憶把這些存下來，下次只重測有改動的畫面。

## 狀態檔

放在 `.frontend-qa/state/`，和每次的執行目錄分開，跨次保留：

```
state/
  screens.md         畫面清單
  fingerprints.json  每個畫面的指紋
  data-types.md      既有資料的型態與抽樣
  known-findings.md  已知問題與狀態
  runs.md            歷次執行
```

`screens.md`：

```markdown
| 代號 | 名稱 | URL | 指紋 | 最後測試 |
|---|---|---|---|---|
| S1 | 登入 | /#/login | 3fa2c1 | 2026-10-06-myapp |
```

`known-findings.md`：每筆一列，F 編號用第一次發現時那次執行的編號，前面加上執行目錄名稱，避免和這次的編號混淆：

```markdown
| 編號 | 畫面 | 等級 | 標題 | 重現摘要 | 狀態 | 首次發現 | 最後確認 |
|---|---|---|---|---|---|---|---|
| 2026-10-06-myapp/F3 | S2 | P1 | 送出後沒有任何回饋 | 離線時在 S2 送出 | 仍存在 | 2026-10-06-myapp | 2026-10-13-myapp |
```

狀態只能是：`仍存在`、`已修`、`不修`（使用者說不修）、`無法複驗`（附原因，例如畫面已移除）。

`runs.md`：每次執行一列，記日期、執行目錄、模式（完整 / 增量）、深度、畫面數、改動畫面數、實際 turns 和 US$。

## 畫面指紋

用來判斷畫面有沒有改動。黑箱測試通常拿不到原始碼，所以不能只靠 git diff。每個畫面在桌機尺寸、資料載入完成後，執行一次：

```js
(() => {
  const name = (e) => (e.getAttribute('aria-label') || e.innerText || e.placeholder || e.name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const parts = [...document.querySelectorAll('h1,h2,h3,label,button,a[href],input,select,textarea,[role=button],th,dt')]
    .filter((e) => e.getClientRects().length > 0)
    .map((e) => (e.tagName.toLowerCase() + ':' + (e.getAttribute('type') || '') + ':' + name(e) + ':' + (e.getAttribute('href') || '')).replace(/\d+/g, '#'));
  const list = [...new Set(parts)].sort();
  let h = 5381;
  for (const c of list.join('|')) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return JSON.stringify({ hash: h.toString(16), list });
})()
```

- 數字都換成 `#`，重複的項目只留一個，所以資料筆數或編號不同，不會被當成改動
- `hash` 寫進 `screens.md`，`list` 寫進 `fingerprints.json`。兩次的 `hash` 不同時，比對 `list` 就知道多了或少了哪些元素，寫在覆蓋地圖的備註
- 使用者給了 git 範圍（例如「這次改了 main..feature」）時，可以用改動的檔案輔助判斷哪些畫面可能改了，但最後以指紋為準：指紋沒變、檔案有改的畫面，也當成有改動

## 增量模式的流程

### 步驟 0

`.frontend-qa/state/` 存在，而且目標 URL 和 `runs.md` 最後一次相同時：
- 使用者在場：告訴使用者上次是哪天、測了幾個畫面、有幾個已知問題，預設用增量模式；使用者說「完整」就照原本的流程
- 無人值守：用增量模式，除非指令寫了「完整測試」

在 `report.md` 開頭的「執行模式」寫「增量（上次：<執行目錄>）」。

### 步驟 1

1. 照原本的方式偵察導覽，找出目前所有畫面
2. 每個畫面計算指紋，和 `screens.md` 比對，分成四類：
   - **有改動**：指紋不同
   - **新增**：`screens.md` 沒有這個畫面
   - **移除**：`screens.md` 有，但這次找不到
   - **沒改動**：指紋相同
3. 覆蓋地圖沿用 `screens.md` 的代號；新增的畫面接著編號。在覆蓋地圖最後加一欄「複驗」
   - 有改動：所有開啟的測試輪和「複驗」欄都是 `☐`
   - 新增：所有開啟的測試輪都是 `☐`；「複驗」欄標 `➖ 新畫面`
   - 沒改動：測試輪欄位標 `➖ 增量：未改動`；「複驗」欄是 `☐`
   - 移除：不列進覆蓋地圖，它的已知問題標 `無法複驗：畫面已移除`
4. `data-types.md` 的既有資料型態直接沿用，只檢查抽樣的那幾筆是否還存在；不存在的話，重新抽一筆
5. 估算成本用 [depth.md](depth.md#增量模式) 的增量公式

### 沒改動畫面的「複驗」

每個沒改動的畫面做這幾件事，做完把「複驗」欄改成 `✅`：
- 打開畫面，清空 console 後重新載入，讀 `console --errors` 和失敗的請求。有新的錯誤，就照一般規則寫成 finding，並把這個畫面改列為「有改動」，補跑測試輪
- 這個畫面上每個 `仍存在` 的已知問題，照重現摘要做一次，更新狀態：還能重現就是 `仍存在`，不能重現就是 `已修`

有改動和新增的畫面，已知問題也要照同樣方式複驗；這些畫面上新發現的問題，照一般規則寫進這次的 `findings.md`。

### 步驟 4

`report.md` 在「範圍」和「摘要」之間加一節「已知問題狀態」（格式見 [report-template.md](report-template.md#reportmd)），列出每個已知問題這次的狀態，以及「這次新發現」的數量。新發現的問題如果和某個已知問題是同一個（同畫面、同現象），不要重複列，改更新那筆已知問題的「最後確認」。

### 結束前更新狀態檔

步驟 6 交付之前：
- `screens.md`、`fingerprints.json` 換成這次的結果
- 這次新發現的問題加進 `known-findings.md`，狀態 `仍存在`
- 已知問題更新狀態和「最後確認」
- `runs.md` 新增一列

第一次執行（沒有狀態檔）時，跑完整模式，最後照同樣方式建立狀態檔。
