# 前端品質驗證報告：小訂單（seeded app）／整個 app

## 環境檢查
- 驅動：chrome-devtools-mcp（`list_pages` 成功，瀏覽器就緒）
- Chrome：Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36

## 範圍
- 日期 2026-10-27；環境：本機；URL http://localhost:4173；測試帳號：qa（密碼由操作者在作業系統鍵盤層輸入到已聚焦的密碼欄，值不出現在任何 MCP 工具參數或紀錄裡）
- 範圍：整個 app；靜態頁（說明、聯絡我們、找不到頁面）依深度 3 不列入覆蓋地圖，但頁尾連結本身在各畫面測
- 禁止動作：本機測試環境，使用者允許所有操作（含建立、刪除訂單）
- 視窗尺寸：桌機 1280x800、手機 390x844
- 深度 3；面項：新手、亂點、設計師、小螢幕鍵盤、惡劣環境、狀態、體檢（標準）、工具軌
- 執行模式：單一 session；完整；入口：完整
- Critic：無人值守，指令沒有允許子代理 → 主 session 自查
- 探測：跳過。MCP server 自行啟動 Chrome，使用 `--remote-debugging-pipe`，沒有可用的 debug port（沒有 `CDP_PORT`，也沒有 `cdpPort`）；本機 Node 為 v20，探測腳本需要 Node 22。該項檢查改由測試輪用 MCP 工具做。下一步：`CDP_PORT=9222 node skills/frontend-qa/scripts/probe.mjs probe.json --out probe-result.json`
- 覆蓋地圖：6 列 × 6 輪 = 36 格；體檢 5 個畫面
- 估算：約 92 turns、16 分鐘、US$4.2（另外 Critic 約 14 turns）

## Critic

主 session 自己複查（沒有另開 Critic 的許可）。finding 判定：成立 21、證據不足 1（F20 移出）、不成立 0。體檢判定：6 筆，全部成立。

## 嚴重度統計

P0 1（F8）、P1 2（F7、F17）、P2 14、P3 4。合計 21（F20 移出，不計）。

## 最嚴重的 5 個問題

1. F8 [P0] 連點「送出訂單」建立兩筆訂單：`repro/F8.steps.md`（pass: false，detail: 寫入請求 2 筆，符合預期）；`repro/F8.spec.ts`（未執行：沒有 Playwright）
2. F7 [P1] 負數數量可以建立訂單：`repro/F7.steps.md`（pass: false，符合預期）；`repro/F7.spec.ts`（未執行：沒有 Playwright）
3. F17 [P1] 送出遇到 500 時跳到「找不到頁面」，輸入消失：`repro/F17.steps.md`（pass: false，符合預期）；`repro/F17.spec.ts`（未執行：沒有 Playwright）
4. F6 [P2] 「已完成」篩選列出全部訂單
5. F4 [P2] 設定按儲存沒有作用

## UI/UX 體檢摘要

回饋 1、一致性 2、文案 2，其他是 3–4。最優先的改進：所有寫入動作補上送出中、成功、失敗三種狀態。詳見 `ux-review.md`。

## 依畫面分組

- S1 登入：F20（移出）、F21（錯誤沒有 role=alert）
- S2 訂單列表：F5、F6、F9、F10、F13、F15、F19、F21
- S3 建立訂單：F2、F7、F8、F11、F17、F18、F22
- S4 訂單詳情：F3、F12、F14、F16
- S5 設定：F4
- 全站頁尾：F1

## 覆蓋率

✅ 41 格、➖ 1 格（P1 流程列的體檢）、⛔ 0 格。

## 未歸因

無（見 `unattributed.md`）。

## 估算與實際

估算約 92 輪、16 分鐘，Critic 另外約 14 輪。實際：從啟動 seeded server 到寫完報告共 194 次工具呼叫（其中瀏覽器 MCP 166 次），13.9 分鐘（runner 時鐘）。開始前讀 skill 參考檔的 8 次呼叫不計時。探測沒跑（沒有 debug port，Node 20），下一步：`CDP_PORT=9222 node skills/frontend-qa/scripts/probe.mjs probe.json --out probe-result.json`。Playwright 沒裝，spec 都沒跑，下一步：`cd .frontend-qa/2026-10-27-seeded-app/repro && BASE_URL=http://localhost:4173 npx --no-install playwright test --reporter=line`。
