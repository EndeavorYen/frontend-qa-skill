# 2026-10-08 deterministic-gates

不需要 LLM 的兩個完成條件，在 `main@ef63183` 上直接執行確認：#5 的探測腳本單獨執行，以及 #10 的重現腳本。這份紀錄**不是** agent 評測，不含 turns、成本或抓到率。

- 環境：Linux、Node 22.23.3、`google-chrome --headless=new --no-sandbox`（`:9490`）、`@playwright/test` 1.64.0（裝在暫存目錄）
- app：原版 seeded-app 在 `:4190`；只修 B1 的副本在 `:4191`（`VARIANT=fix-b1`，見 [variants/fix-b1.mjs](../seeded-app/variants/fix-b1.mjs)）
- 每次執行前都重新啟動伺服器

## #5：探測腳本單獨執行

```bash
CDP_PORT=9490 node skills/frontend-qa/scripts/probe.mjs probe.json --out probe-result.json
```

設定檔是 [evals/probe/seeded-app.json](../probe/seeded-app.json)，只把 `base` 換成 `:4190`（[probe.json](2026-10-08-deterministic-gates-artifacts/probe.json)）。40 秒跑完，完整結果在 [probe-result.json](2026-10-08-deterministic-gates-artifacts/probe-result.json)。

| 答案卷 | 探測結果 | 抓到 |
|---|---|---|
| B1 | `double-submit`：連點兩下送出，發出 2 個寫入請求（`/api/orders`） | ✅ |
| B3 | `stuck-loading`：API 500 與離線，5000ms 後仍顯示「載入中」 | ✅ |
| B7 | `not-keyboard-reachable`、`no-accessible-name`：`div.icon-btn "🗑"`（1440 與 390） | ✅ |
| B10 | `low-contrast`：`span.hint "數量必須是正整數"` `rgb(200, 200, 200)` 1.56:1 | ✅ |
| B11 | `horizontal-overflow`：`/#/orders/3` 在 390x844，scrollWidth 536 > 390 | ✅ |
| B12 | `console-error`（record）：`/#/orders/3` 的 `TypeError: Cannot read properties of undefined (reading 'trim')` | ✅ |
| B20 | `no-feedback`（離線）：送出後 5000ms 內畫面和網址都沒有變化 | ✅ |

7 / 7 都抓到。其他結果：`small-target` 14、`failed-request` 1（`/favicon.ico` 404）、`no-error-message` 1（API 500 送出後跳到 `#/orders/undefined` 的找不到頁面）。

#5 剩下的條件（輪數比 skill-v2 少 20% 以上、抓到率不低於 skill-v2）要靠有 turns 紀錄的評測。

## #10：重現腳本

照 [evals/repro/README.md](../repro/README.md) 執行：

```bash
BASE_URL=http://localhost:<port> npx playwright test -c evals/repro
```

| 受測的 app | F1（B1） | F2（B2） | F3（B3） | F6（B6） | F20（B20） |
|---|---|---|---|---|---|
| 原版（`:4190`） | ✘ | ✘ | ✘ | ✘ | ✘ |
| 只修 B1（`:4191`） | ✓ | ✘ | ✘ | ✘ | ✘ |

原版 5 份都失敗在斷言；只修 B1 時只有 F1 通過（[原版輸出](2026-10-08-deterministic-gates-artifacts/repro-original.txt)、[修 B1 輸出](2026-10-08-deterministic-gates-artifacts/repro-fix-b1.txt)）。

這 5 份是照 `repro.md` 手寫的範例。#10 剩下的關卡是 agent 在 QA 執行中**自己寫出**的 spec：2026-10-06 grok47-b20-retest 的 findings 有寫 `repro/F1.spec.ts`…`F8.spec.ts`，但標「未執行：沒有 Playwright」，檔案也沒有放進評測產物，所以還不能計分。下一次評測要把 agent 寫的 `repro/` 一起收進產物，再用上面的指令對原版和 `fix-b1` 各跑一次。
