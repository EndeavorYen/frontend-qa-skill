# 重現

P0 和 P1 除了文字的重現步驟，還要有一份只用 MCP 工具就能重播的檔案。斷言寫「**修好之後應該成立的事**」：bug 還在時 `pass` 是 false，bug 修好時 `pass` 是 true。

- `repro/F<n>.steps.md`：主要的重播檔。每一步是一則 MCP 工具呼叫。重播不需要 Playwright。
- `repro/F<n>.spec.ts`：只有被測目標**已經有** Playwright 時才依 steps 檔手寫。沒有就跳過，不要安裝，也不要匯出。

允許的工具只有 [SKILL.md](../SKILL.md#需求) 那份清單。steps 檔裡的目標寫 role 和可及名稱，不寫 uid。uid 每次 `take_snapshot` 都會變。

## 什麼時候寫

P0、P1 第二次從乾淨狀態重現成功之後。F 編號和 `findings.md` 相同。乾淨狀態的做法見 [SKILL.md](../SKILL.md) 步驟 1：`evaluate_script` 寫回 `localStorage`、`sessionStorage` 和非 HttpOnly 的 `document.cookie`，再用 `navigate_page`（`type` 為 `url`）打開存下來的網址。HttpOnly cookie 和伺服器狀態還原不了，改重跑設定步驟（重新登入）。測試輪中途 app 自己登出、頁面停在 `#/login` 時，storage 寫回後仍要 `navigate_page` 到存下來的網址。

## steps 檔

路徑是 `.frontend-qa/<run>/repro/F<n>.steps.md`。編號步驟，每步寫四件事：工具名稱、目標（role + 可及名稱；沒有元素目標的工具改寫 url 或參數）、輸入值、預期觀察。最後一步一定是斷言，見下一節。

密碼不寫進檔案。登入步驟的 value 寫 `env:QA_PASSWORD`，重播時才讀環境變數。不要把登入密碼放進 `evaluate_script` 的函式本文。

```markdown
# F7

1. tool: navigate_page
   type: url
   url: http://localhost:3000/orders/new
   expect: heading「建立訂單」可見
2. tool: fill
   target: { role: textbox, name: 客戶名稱 }
   value: QA
   expect: 該欄位顯示 QA
3. tool: click
   target: { role: button, name: 送出訂單 }
   expect: 網址或畫面有變化
4. tool: evaluate_script
   function: () => { const row = document.querySelector("tbody tr"); const text = row ? row.innerText : ""; const pass = text.includes("2026-01-03"); return { pass, detail: pass ? "first row has 2026-01-03" : "first row is " + text }; }
   expect: 有 bug 的版本回傳 pass false
```

連點不能用兩次 `click`：`click` 一次只點一下，而且會等工具回傳。把兩次 `.click()` 寫進同一步 `evaluate_script`，按鈕用 role 和可及名稱在函式裡找：

```js
() => {
  const button = [...document.querySelectorAll("button")].find((element) =>
    (element.getAttribute("aria-label") || element.innerText || "").trim() === "送出訂單");
  button.click();
  button.click();
  return { clicked: 2 };
}
```

慢網路或斷線用 `emulate` 的 `networkConditions`（`Slow 3G`、`Offline`）。沒有攔截 HTTP 的工具；要讓 API 回 500 時，用一步 `evaluate_script` 包住 `window.fetch`（頁面若用 XHR 也一併包住），只攔這次的網址片段。測完 `navigate_page`（`type` 為 `reload`）還原。

視窗大小用 `resize_page`。要連觸控與 mobile 版面一起模擬時用 `emulate` 的 `viewport`（例如 `390x844x1,mobile,touch`）。

## 斷言

最後一步的 `evaluate_script` 必須回傳 `{pass: boolean, detail: string}`。`pass` 表示修好之後應該成立的事。finding 在有 bug 的版本上確認，只有重播回傳 `pass: false` 才算數。修好後再查時，同一份檔回傳 `pass: true`。

`detail` 寫人看得懂的一句話，說明量到什麼（例如「寫入請求 2 筆」），不要只寫 true 或 false。

寫斷言時：

- 優先斷言「出現了什麼」。用「不見了」「數量是 0」時，函式裡要先確認現在真的在要測的畫面（網址與標題），否則被導回首頁也會通過。
- 隱藏元素不算。文字用可見節點，不要用 `innerHTML` 去對到 `display: none` 的預埋錯誤。
- 連點不要用清單上某個固定名稱的列數。後端可能還留著上一輪同名資料。在這一步之前用 `evaluate_script` 包住寫入用的 `fetch`，只數請求，回一個假的成功回應，不斷言舊列。
- 主要按鈕被固定 footer 擋住：先 `resize_page` 或 `emulate` 到 `390x844`，不要捲動長列表，也不要對按鈕呼叫 `scrollIntoView`。`evaluate_script` 用 `elementFromPoint` 取按鈕當下的中心，`pass` 為命中的是 `BUTTON`。`take_screenshot` 的 `fullPage` 會把固定 footer 畫進長頁中間，不能拿來寫這條斷言。
- 送出時斷網沒有回饋：`emulate` 的 `networkConditions` 為 `Offline` 後送出，斷言 5 秒內出現看得見的錯誤文字（失敗、錯誤、無法、離線、請稍後）。等待用 `wait_for` 的 `text`，或在斷言函式裡讀可見文字；不要另叫清單以外的工具。

有 bug 的版本若回傳 `pass: true`，斷言沒有抓到 bug，改寫最後一步再重播。

## 重播

1. `new_page` 開一個新分頁，載入 steps 第 1 步的 url（第 1 步若不是導覽，就載入 finding 的起始 URL）。不要沿用測試輪那個分頁的畫面狀態。
2. 需要已登入的乾淨狀態時，先照 SKILL.md 步驟 1 還原 `checkpoint.json`。HttpOnly cookie 或伺服器狀態還原不了就重跑設定步驟。會寫入的重現，重播前先把後端重設回乾淨資料，否則舊資料會讓斷言判錯。seeded app 的做法是重啟 `node evals/seeded-app/server.mjs`（要驗證修好的版本時加上 `VARIANT=fix-b1`），再還原 storage，然後 `navigate_page` 到存下來的網址，讓文件換成現在的前端。
3. 依編號執行每一步。動作前先 `take_snapshot`，用 role 和可及名稱對到這次的 uid，再呼叫該工具。對不到元素就停止，不要猜 uid。
4. 跑最後一步的 `evaluate_script`。
5. 在 `report.md` 該 finding 的重播行寫結果：`repro/F<n>.steps.md`（pass: false，detail: …，符合預期）或 `repro/F<n>.steps.md`（pass: true，detail: …，已修）。重播做不完時寫原因，不要留空白。

| 結果 | 怎麼處理 | finding 的「重播」寫法 |
|---|---|---|
| 步驟都做完，`pass` 是 false | 有 bug 的版本上符合預期 | `repro/F<n>.steps.md`（pass: false，detail: …，符合預期） |
| 步驟都做完，`pass` 是 true | 有 bug 的版本上代表斷言沒抓到 bug，改寫斷言再跑。修好後再查時，這列代表已修 | 有 bug 的版本先不要寫；已修時寫 `repro/F<n>.steps.md`（pass: true，detail: …，已修） |
| 步驟對不到元素或工具失敗 | 修好 steps 或乾淨狀態再跑 | — |

## 會寫入資料的腳本

steps 檔會真的操作 app。會建立、修改資料，或觸發付款、寄信的項目：

- 在 finding 的「重播」那一行註明會寫入什麼。有手寫 spec 時，spec 第一行註解加上 `// 會寫入：<寫入什麼>`
- 能只計數、不需要真的寫入的（例如連點），用 `evaluate_script` 包住寫入請求並回假成功。有 spec 時用 `page.route` 做同一件事
- 遵守步驟 0 的禁止動作。正式環境不跑這類重播或腳本

## Playwright

不要匯出 spec，也不要安裝 Playwright。被測目標已經有 Playwright 時，才可以依 `repro/F<n>.steps.md` 手寫 `repro/F<n>.spec.ts`。沒有就跳過，finding 的「重現腳本」寫「未手寫：目標專案沒有 Playwright」。

手寫時：

- 刪掉登入段落裡的明文密碼。共用 `repro/_login.ts`：網址用 `BASE_URL`，密碼用 `QA_PASSWORD`。密碼不能寫進任何檔案
- 用 `test.step` 分成「前置」和「斷言」。前置要有正向錨點（網址與標題可見）。否定斷言（「不見了」「數量是 0」）前面一定要有這個錨點
- 斷言和 steps 檔最後一步要證明同一件事
- 需要 `@playwright/test` 1.51 以上（`filter({ visible: true })`）。版本更低或沒有套件時不要執行、不要安裝

有 spec 時才跑：

```bash
cd .frontend-qa/<run>/repro && npx --no-install playwright --version
cd .frontend-qa/<run>/repro && BASE_URL=<網址> npx --no-install playwright test --reporter=line
```

`QA_PASSWORD` 要事先放在環境變數裡，不要直接寫在指令上。

| 結果 | 怎麼處理 | finding 的「重現腳本」寫法 |
|---|---|---|
| 失敗在「斷言」 | 有 bug 的版本上符合預期 | `repro/F<n>.spec.ts`（目前失敗，符合預期） |
| 通過 | 斷言沒有抓到 bug，改寫斷言 | — |
| 失敗在「前置」 | 設定錯誤，修好再跑 | — |
| 找不到 Playwright，或 `Executable doesn't exist` | 不要自己安裝 | `repro/F<n>.spec.ts`（未執行：沒有 Playwright） |
| 版本低於 1.51 | 不要執行 | `repro/F<n>.spec.ts`（未執行：Playwright 版本 < 1.51） |
| 沒有測試帳號密碼 | 不要寫死密碼 | `repro/F<n>.spec.ts`（未執行：沒有測試帳號密碼） |
| 目標專案沒有 Playwright | 不要手寫 | 未手寫：目標專案沒有 Playwright |

沒有 spec 不影響上面的 MCP 重播。複驗以 steps 檔為準。

## 複驗

跨次執行時，steps 檔在 `state/repro/`（見 [memory.md](memory.md#結束前更新狀態檔)）。有手寫 spec 時，`_login.ts` 全專案共用一份。`checkpoint.json` 含 cookie 和 storage，不能複製到 `state/`。

使用者要確認問題修好了沒有時，不需要重新測試。每個 P0、P1 用上面「重播」的同一組做法：會寫入的項目先重設後端，再還原 storage、`navigate_page` 到存下來的網址、依 steps 重播。前端重新部署或換了 variant 之後，一定要重新載入文件，否則分頁仍跑舊程式，修好的 bug 會被誤判成仍存在。

- 重播完成且 `pass` 是 true：標成「已修」
- 重播完成且 `pass` 是 false：標成「仍存在」
- 重播做不完：可能是畫面改版或乾淨狀態已不能還原，交給 agent 照文字重現步驟判斷，必要時更新 steps 檔
- 會寫入資料的項目，只在非正式環境跑；正式環境照 [critic.md](critic.md#怎麼驗證) 的「有副作用的 finding」

有 spec 時可以另跑，作為交給 CI 的同一份斷言。沒有 Playwright 時跳過，不影響上面的複驗：

```bash
cd .frontend-qa/<run>/repro && BASE_URL=<網址> npx --no-install playwright test --reporter=json > result.json
```

- 通過：和 `pass: true` 一致才標成「已修」
- 失敗在「斷言」：標成「仍存在」
- 失敗在「前置」：可能是畫面改版，交給 agent 照文字重現步驟判斷，必要時更新腳本
- 第一行有 `// 會寫入` 的腳本，只在非正式環境跑
