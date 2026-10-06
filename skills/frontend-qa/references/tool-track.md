# 工具軌（chrome-cdp-ex）

工具軌記錄驅動工具本身的問題，最後整理成給工具 repo 的 issue。這份文件以 chrome-cdp-ex 為例；換成別的工具時，流程相同，只需要替換指令。

## 版本

步驟 0 時記錄，寫進 `report.md` 和 `tool-track.md` 的開頭：

```bash
CDP_DIR="$(readlink -f ~/.claude/skills/chrome-cdp-ex)"
git -C "$CDP_DIR" rev-parse --short HEAD        # 工具版本
git -C "$CDP_DIR" remote get-url origin          # issue 要發到的 repo
"$CDP_DIR/bin/chrome-cdp" doctor                 # Node、Chrome、連線狀態
```

Chrome 版本用 `eval <t> "navigator.userAgent"` 取得。

## 歸因

遇到預期外結果時，依序嘗試以下方法：

1. **先讀回報**：失敗時，chrome-cdp-ex 會印出 `Error:`、`Kind:`、`Next:`。
   - `Kind: covered`（有其他元素擋在點擊位置）和 `Kind: disabled`（控制項被停用）描述的是頁面狀態，通常要往產品去查。先用 `overlay <t> <ref>` 看是什麼擋住；如果使用者也會被擋住，就是產品問題。
   - `Kind: policy` 代表撞到護欄。照 `Next:` 處理，不要繞過；這不算工具 bug。
   - `Kind: hidden-tab` 代表分頁在背景，照 `Next:` 處理即可。
2. **換一條路重試**：
   - 點擊：`click` → `click --js` → `verify-click`
   - 輸入：`fill` → `type` → `eval` 直接設定值並觸發事件
   - 讀取畫面：`perceive` → `text --auto` → `shot` → `eval` 讀 DOM
3. **判斷**：

| 原方法 | 替代方法 | 頁面證據 | 歸到 |
|---|---|---|---|
| 失敗 | 成功 | — | 工具軌 |
| 回報成功 | — | DOM 或截圖顯示其實沒有發生 | 工具軌（回報不實，最嚴重的一種） |
| 失敗 | 失敗 | DOM、截圖或 console 顯示頁面有問題 | 產品軌 |
| 失敗 | 失敗 | 看不出原因 | 未歸因 |

用替代方法繞過之後，就繼續測試，不要停下來修工具。

## 紀錄格式

工具軌記兩種東西，編號都用 `T1`、`T2`…：

- **工具 bug**：當掉、逾時、回報不實、輸出錯誤、`Next:` 建議錯誤、`perceive` 漏掉元素、文件和實際行為不一致。
- **摩擦**：功能可以用，但很費力。例如一件事要下三個指令、輸出太長得自己找重點、缺少某個能力只好用 `eval` 繞過、指令名稱或參數不直覺。

```markdown
### T2 [bug] `click` 回報 Outcome: changed，但送出按鈕實際沒有被點到

- 指令：`click <t> @14`
- 預期：觸發送出
- 實際：回報 `Outcome: changed`，但 netlog 沒有任何請求，DOM 也沒有變化
- 替代方法：`click <t> @14 --js` 成功
- 重現條件：按鈕在 sticky footer 裡，而且頁面捲動到最底部
- 影響：覆蓋地圖 S2 的「小螢幕鍵盤」格標為 ⛔ T2
- 輸出節錄：（只保留相關的幾行）
```

```markdown
### T5 [摩擦] 要確認點擊後有沒有發出請求，得另外下 netlog

- 情境：每次點擊送出後都要確認 API 有沒有被呼叫
- 目前做法：`click` 之後接 `netlog --type fetch`
- 建議：`click` 加上類似 `--expect-request <url>` 的選項，直接在回報中列出結果
- 頻率：這次 QA 中做了約 20 次
```

## 收尾回報

1. **分類**：把 `tool-track.md` 分成 bug 和摩擦兩組；同一個根本原因的多筆紀錄合併成一筆。
2. **去重**：每一筆都先搜尋現有 issue，包含已關閉的：
   ```bash
   gh issue list -R <owner/repo> --state all --search "<關鍵字>" --limit 10
   ```
   如果已經有人回報過，就把這次的新資訊（版本、重現條件）準備成留言草稿，而不是開新 issue。
3. **寫草稿**：照下方範本，把草稿寫在 `tool-track.md` 的 `## Issue 草稿` 底下。
4. **去除敏感資訊**：被測網站的 URL、網域、帳號、頁面內容、截圖，都要換成通用描述（例如「一個有 sticky footer 的表單頁」）。重現步驟盡量改寫成公開網頁或最小 HTML 就能重現的版本。
5. **使用者確認**：列出所有草稿（標題 + 新開 issue 或留言既有 issue），等使用者逐筆同意。
6. **發出**：只發出使用者同意的那些，並把連結寫回對應的 T 編號。使用者決定不報的，標為「不報」。

### Issue 範本

```markdown
**標題**：<指令>: <一句話描述現象>

## 環境
- chrome-cdp-ex: <commit SHA>
- Chrome: <版本>
- OS / Node: <版本>

## 重現
1. …（最小重現步驟，不包含被測網站的資訊）

## 預期
…

## 實際
…（輸出節錄）

## 替代方法
…

## 背景
這是在使用 chrome-cdp-ex 進行前端 QA 時發現的。
```

摩擦類的 issue，標題前加上 `[proposal]`，內文把「預期」和「實際」改成「目前做法」和「建議」。
