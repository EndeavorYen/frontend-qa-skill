# 重播已提交的 F1–F8（2026-10-09）

這份紀錄重播 `evals/results/2026-10-09-grok47-catchrate-artifacts/repro/` 裡已提交的 `F1.spec.ts`–`F8.spec.ts` 與 `_login.ts`。規格沒有改。沒有 LLM。對照表沿用 [2026-10-09-grok47-catchrate.md](2026-10-09-grok47-catchrate.md)：B1=F2、B2=F1、B3=F5、B6=F4、B20=F6。F3 是 B16、F7 是 B7、F8 是 B4，不在 #10 的五題裡，仍照原檔一起跑。

Issue #10 的兩個完成條件，對 B1、B2、B3、B6、B20 **都達到**。

- (a) 這五題各有一支可執行的 spec，在目前有 bug 的 app 上兩輪都失敗，而且失敗都在「斷言」。
- (b) `VARIANT=fix-b1` 只修 B1。兩輪都是 F2 通過，F1、F4、F5、F6 仍失敗。

這些 spec 出自 #44 那一輪。那一輪計分用的是父提交 `103ed37`，加上當時尚未提交的參考修改，裡面有種子站的字面例子。該紀錄的「這次改了哪五份參考」已經寫過。這份重播只記錄規格在有 bug 的站與只修 B1 的站上的結果。

## 怎麼跑

環境：Node v22.14.0、`@playwright/test` 1.64.0（裝在 repo 外面）、Google Chrome 148.0.7778.96（Playwright `channel: 'chrome'`）。密碼只在環境變數 `QA_PASSWORD`，指令上沒有密碼，這份紀錄也不寫密碼。

每一輪開始前，該輪用的伺服器都是剛啟動、還沒接過上一輪重播的行程。有 bug 的站聽 `127.0.0.1:4190`。只修 B1 的站聽 `127.0.0.1:4191`。

```bash
PORT=4190 node evals/seeded-app/server.mjs
PORT=4191 VARIANT=fix-b1 node evals/seeded-app/server.mjs
```

Playwright 設定在 repo 外面：`testDir` 指向上面的 `repro/`，`workers` 為 1，headless，啟動參數 `--no-sandbox` 與 `--disable-dev-shm-usage`。`NODE_PATH` 指向 repo 外面的安裝，所以用 `npx --no-install`。有 bug 的站跑兩次，`fix-b1` 跑兩次。

```bash
SPEC_DIR=<repo>/evals/results/2026-10-09-grok47-catchrate-artifacts/repro \
BASE_URL=http://127.0.0.1:4190 \
npx --no-install playwright test --reporter=line --config <playwright-install>/playwright.config.ts

SPEC_DIR=<repo>/evals/results/2026-10-09-grok47-catchrate-artifacts/repro \
BASE_URL=http://127.0.0.1:4191 \
npx --no-install playwright test --reporter=line --config <playwright-install>/playwright.config.ts
```

四次的結束碼都是 1。下面四份是 `--reporter=line` 的原始輸出，唯一改動是把 checkout 路徑前綴換成 `<repo>`，並在檔首標明輪次、在檔尾附上 `EXIT:`。

- [bugged-run1.txt](2026-10-09-repro-replay-artifacts/bugged-run1.txt)
- [bugged-run2.txt](2026-10-09-repro-replay-artifacts/bugged-run2.txt)
- [fixb1-run1.txt](2026-10-09-repro-replay-artifacts/fixb1-run1.txt)（reporter：7 failed，1 passed，34.5s）
- [fixb1-run2.txt](2026-10-09-repro-replay-artifacts/fixb1-run2.txt)（reporter：7 failed，1 passed，34.3s）

有 bug 的兩輪，reporter 摘要是 `8 failed`，沒有印秒數。兩輪之間、以及 `fix-b1` 兩輪之間，斷言文字相同；不同的只有錯誤上下文目錄名稱，以及 `fix-b1` 的 34.5s／34.3s。

## 結果

| 規格 | 題 | 有 bug，第 1 輪 | 有 bug，第 2 輪 | fix-b1，第 1 輪 | fix-b1，第 2 輪 |
| --- | --- | --- | --- | --- | --- |
| F1 | B2 | 失敗。斷言預期 BUTTON，實際 FOOTER | 同上 | 同上 | 同上 |
| F2 | B1 | 失敗。斷言預期 1，實際 2 | 同上 | 通過 | 通過 |
| F3 | B16 | 失敗。斷言預期長度 0，實際長度 1 | 同上 | 同上 | 同上 |
| F4 | B6 | 失敗。重整後名稱不是剛填的值（預期 `QA顯示名稱`，實際 `qa-user@example.com`） | 同上 | 同上 | 同上 |
| F5 | B3 | 失敗。5 秒內看不到「失敗／錯誤／無法／請稍後」 | 同上 | 同上 | 同上 |
| F6 | B20 | 失敗。5 秒內看不到「失敗／錯誤／無法／離線／請稍後」 | 同上 | 同上 | 同上 |
| F7 | B7 | 失敗。看不到名稱含「刪除」的按鈕 | 同上 | 同上 | 同上 |
| F8 | B4 | 失敗。看不到「沒有／無資料／尚無」 | 同上 | 同上 | 同上 |

八支都跑完登入與前置。失敗都落在「斷言」。F4 的堆疊在重整後的 `toHaveValue`（`F4.spec.ts:16`），不是「已儲存」那一行。F2 在 `fix-b1` 的兩輪都只有進度行、沒有失敗區塊。
