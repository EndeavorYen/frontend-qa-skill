# 重現

P0 和 P1 除了文字的重現步驟，還要有兩份檔案。斷言都寫「**修好之後應該成立的事**」：bug 還在會失敗，bug 修好會通過。

- `repro/F<n>.actions.json`：主要的重播檔。複驗用 chrome-cdp-ex 的 `replay`，不需要 LLM，也不需要安裝 Playwright。
- `repro/F<n>.spec.ts`：`export-playwright` 匯出後再改過的 spec，交給開發者或 CI。寫法規則見下面「怎麼寫 spec」。

`replay` 只會重做動作，不會判斷 bug 是否還在。重播之後要接一段斷言：`flow <t> "assert selector …; assert text …"`。

## 什麼時候寫

P0、P1 第二次從乾淨狀態重現成功之後。F 編號和 `findings.md` 相同。乾淨狀態是 `restore <t> --file .frontend-qa/<run>/checkpoint.json --format json`，然後 `perceive <t>`。測試輪中途 app 自己登出時，`restore` 把 session 寫回 storage，頁面仍停在 `#/login`；先 `reload <t>` 再 `perceive <t>`，頁面才會讀到還原後的 session。

## 重播檔

`record-actions` 沒有「從現在開始錄」的旗標。它匯出這個分頁 daemon 從啟動到現在的整個 action log（schema `chrome-cdp-ex.record-actions.v1`）。要讓檔案只含這一次重現：

1. `restore <t> --file .frontend-qa/<run>/checkpoint.json --format json`。測試輪中途 app 自己登出、頁面停在 `#/login` 時，先 `reload <t>`。再 `perceive <t>`。這時已經是登入後的乾淨狀態。
2. 執行 `throttle <t> off` 和 `mock <t> clear`，清掉上一輪留下的設定。`stop` 之後新的 daemon 會套用 `cdp-<targetId>.env.json` 裡還留著的 throttle 和 mock。這次重現本身要用的 mock 或 throttle，留到 `stop` 之後再設。
3. `stop <t>`。daemon 和它的 action log 會消失，分頁、cookie、網址還在。不要用 `closetab`。
4. 只做這次重現的步驟，不要做登入。密碼欄位不要出現在這段裡。這次需要的 `mock <t> add …` 或 `throttle <t> …` 放在這些步驟前面，`record-actions` 會把它們放進 `environment`，`replay` 會先做。
5. 存檔。stdout 若以 `daemon restarted:` 開頭，拿掉那一行再存，否則 `replay` 會報 invalid JSON：

```bash
"$CDP_DIR/bin/chrome-cdp" record-actions <t> --format json > .frontend-qa/<run>/repro/F<n>.actions.json
"$CDP_DIR/bin/chrome-cdp" export-playwright <t> > .frontend-qa/<run>/repro/F<n>.spec.ts.draft
```

`record-actions` 會把密碼欄位寫成 `<redacted>`。這一筆的 `replayable` 是 false，`needsInput` 是 `["text"]`。`replay` 會跳過它，reason 是 `not replayable`，不會填空字串，也不會把密碼填回去。所以重播檔必須從 `restore` 之後已登入的狀態開始錄，不包含登入步驟。存檔後確認沒有 `needsInput` 含 `text` 的 fill，而且 `replayable` 不是 false；有的話這份檔不能拿來複驗，改步驟再錄一次。

`eval`、`eval64`、`call` 不是 action，不會寫進 action log。`record-actions` 的 `actions[].command` 不會有它們，`replay` 也不會重做。連點就是這種情況：`click` 和 `repeat` 都會等頁面穩定，做不出快速連點，只能用 `eval`（見 [personas.md](personas.md#亂點)），所以連點本身不在重播檔裡。

錄連點時，`stop` 之後只做連點之前的步驟，讓檔案停在按鈕還在的畫面。連點之後才做的 `nav` 不要錄進同一份檔，否則 `replay` 會在連點之前離開那個畫面，後面的 `eval` 點不到按鈕。連點的 `eval` 寫進 finding 的步驟，也寫進下面驗證用的 `flow`。存檔後確認 `actions[].command` 沒有 `eval`，而且每步 `replayable` 是 true、`needsInput` 是空的。

`flow` 先用分號切開步驟，再把每個步驟用空白切開。`eval` 會把切開的參數用空白接回一行，所以寫進 `flow` 的那個 `eval` 不能含分號；兩次 `.click()` 用逗號接。`flow` 裡的 `wait` 只接受 `dom stable` 和 `network idle`，不是毫秒。毫秒等待是另一個指令 `wait <t> <ms>`，它也不是 action，`replay` 不會重做。

## 怎麼寫 spec

1. 上面 `export-playwright <t>` 的輸出當草稿（要 JSON 給另一個 agent 時加 `--format json`；寫 spec 用預設的文字輸出）。草稿通常**不能直接用**：
   - 可能少了登入步驟，也可能帶著登入時填的明文密碼。**刪掉草稿中的登入段落**，一律改用共用的 `repro/_login.ts`
   - `eval` 做的操作（例如連點）不會匯出
   - 沒有任何斷言
2. `_login.ts` 的網址用 `BASE_URL` 環境變數，密碼用 `QA_PASSWORD` 環境變數。**密碼不能寫進任何檔案**，登入失敗時也不能為了讓腳本跑起來就寫死
3. 用 `test.step` 把腳本分成「前置」和「斷言」兩段。觸發 bug 之前，前置裡一定要有**正向錨點**：確認現在真的在要測的畫面、而且畫面已經載入，例如 `await expect(page).toHaveURL(/projects\/new/)` 加上 `await expect(page.getByRole('heading', { name: '新增專案', exact: true })).toBeVisible()`（`exact: true`，否則「專案」也會比對到「新增專案」）。斷言是否定斷言（「不見了」「數量是 0」），而且用了 mock、延遲這類 route 觸發條件時，前置還要證明它**真的生效了**，例如 route 裡計數、前置最後 `await expect.poll(() => injected).toBeGreaterThan(0)`。沒有錨點的話，登入失效、被導回首頁，或 mock 沒攔到請求時，「某個東西不見了」這類斷言會直接通過，被誤判成已修
4. 補上觸發 bug 的那一步：

| 情境 | 寫法 |
|---|---|
| 連點 | `page.evaluate(() => { const b = document.querySelector('<sel>'); b.click(); b.click(); })`，同一個 task 內點兩次 |
| API 回錯誤 | `page.route((url) => url.pathname === '/api/<路徑>', (r) => { injected++; return r.fulfill({ status: 500, body: '{}' }); })`。用函式比對，網址加了 query 也攔得到 |
| 斷網 | `context.setOffline(true)` |
| 請求很慢 | `page.route(…, async (r) => { injected++; await new Promise((ok) => setTimeout(ok, 10000)); return r.continue(); })` |
| 換一個尺寸 | `test.use({ viewport: { width: <寬>, height: <高> } })` |

需要 `@playwright/test` 1.51 以上（`filter({ visible: true })`）。

5. 寫斷言，描述修好之後應該看到什麼。優先用「出現了什麼」的正向斷言；用「不見了」「數量是 0」這類否定斷言時，前面一定要有第 3 點的錨點。找文字時加上 `filter({ visible: true })`，因為表單常常預先埋了隱藏的錯誤元素。同一件事要能寫成 `flow` 的斷言，見下一節：

```ts
// 失敗時要有看得見的錯誤訊息
await expect(page.getByText(/失敗|錯誤|無法/).filter({ visible: true }).first()).toBeVisible({ timeout: 5000 });

// 排序後第一列是日期最早的那一筆
await expect(page.locator('tbody tr').first()).toContainText('2026-01-03');

// 上傳後檔案出現在附件列表
await expect(page.getByRole('listitem').filter({ hasText: 'report.pdf' })).toBeVisible();

// 只發出一個寫入請求：先等第一個回應，再多等一段時間看有沒有第二個
const writes: string[] = [];
page.on('request', (r) => { if (r.method() !== 'GET' && r.url().includes('/api/projects')) writes.push(r.url()); });
// ……觸發……
await expect.poll(() => writes.length).toBeGreaterThan(0);
await page.waitForTimeout(1000);
expect(writes.length).toBe(1);
```

範例：

```ts
// repro/_login.ts
import type { Page } from '@playwright/test';
export const BASE = process.env.BASE_URL || 'http://localhost:3000';
export async function login(page: Page) {
  await page.goto(BASE + '/login');
  await page.locator('[name=email]').fill('qa@example.com');
  await page.locator('[name=password]').fill(process.env.QA_PASSWORD ?? '');
  await page.locator('form button').click();
  await page.waitForURL(/dashboard/);
}

// repro/F4.spec.ts
// F4 [P1] 依到期日排序後，第一頁的順序是錯的
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';
test('依到期日排序後，第一列是最早到期的專案', async ({ page }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.goto(BASE + '/projects');
    await expect(page.getByRole('heading', { name: '專案', exact: true })).toBeVisible();
    await page.getByRole('columnheader', { name: '到期日' }).click();
  });
  await test.step('斷言', async () => {
    await expect(page.locator('tbody tr').first()).toContainText('2026-01-03');
  });
});
```

## flow 的斷言

v2.21.0 的 `flow` 只有三種斷言，判斷方式和 spec 不是同一個 API：

| flow | 實際檢查 |
|---|---|
| `assert selector <css>` | `document.querySelector` 有匹配，包含隱藏元素 |
| `assert selector-missing <css>` | 沒有匹配 |
| `assert text <字串>` | `document.body.innerText` 包含這段字（不是正規表示式，也不是 exact） |

`innerText` 不含 `display: none` 的文字，所以「出現看得見的錯誤訊息」可以寫成 `assert text 失敗`，對得上 spec 的 `getByText(...).filter({ visible: true })`。字串會匹配頁面上任何一處：spec 用 `exact: true` 避免「專案」匹配到「新增專案」時，flow 要寫更長的字串，或改用只在修好後才存在的 selector。

對得上的例子：

```bash
"$CDP_DIR/bin/chrome-cdp" flow <t> "assert text 失敗" --format json
"$CDP_DIR/bin/chrome-cdp" flow <t> "assert selector tbody tr:first-child; assert text 2026-01-03" --format json
"$CDP_DIR/bin/chrome-cdp" flow <t> "assert text report.pdf" --format json
```

第二個例子的 `assert text` 仍是整頁包含，不是「只有第一列」。日期若也出現在別處，spec 保留 `tbody tr` 第一列的斷言，flow 改寫成修好後才匹配得到的 selector，並在 finding 寫明 flow 檢查的是哪一件事。

請求次數、網址、`exact` 角色名稱，flow 表達不了。spec 保留原來的斷言。flow 改寫成修好之後畫面上看得到的文字或 selector，和 spec 要證明的是同一件事（例如連點修好後畫面上只有一筆新資料，而不是去數請求）。

`flow` 的 `--format json` 在斷言失敗時，該步的 `failureKind` 是 `assertion`，而且指令非 0。成功時 JSON 在 stdout。斷言失敗時同一份 JSON 在 stderr，stdout 是空的；解析時兩邊都要讀，並先拿掉開頭的 `daemon restarted:` 那一行。

## 會寫入資料的腳本

重播檔和 spec 都會真的操作 app。會建立、修改資料，或觸發付款、寄信的項目：
- spec 的第一行註解加上 `// 會寫入：<寫入什麼>`；重播檔在 finding 的「重播」那一行註明會寫入什麼
- spec 能只計數、不需要真的寫入的（例如連點檢查），用 `page.route` 攔截寫入請求，回一個假的成功回應。重播檔要同樣不寫入時，重現過程改用 `mock <t> add <urlPattern> --status <code> --body <text>`，讓它進 `environment`
- 遵守步驟 0 的禁止動作。正式環境不跑這類重播或腳本

## 驗證腳本

寫完要在**目前的 app** 上確認：重播本身成功，失敗落在後面的 flow 斷言。先回到乾淨狀態，再重播，再斷言。

`restore` 只還原這個分頁的 URL、cookie 和 storage，不還原後端，也不重新載入頁面。會寫入的重現，重播前要先把後端重設回乾淨資料，否則上一輪建立的資料還在，斷言會因為舊資料失敗或通過。seeded app 的做法是重啟 `node evals/seeded-app/server.mjs`（要驗證修好的版本時加上 `VARIANT=fix-b1`），再 `restore`。

`restore` 回到同一個 origin 的 hash 網址時，分頁不會重抓前端。重新部署或換了 variant 之後，分頁仍跑舊的 `app.js`，修好的 bug 會被誤判成仍存在。`restore` 之後先 `reload <t>`：cookie 和 storage 還在，文件才換成現在的前端。然後 `perceive <t>`。測試輪中途 app 自己登出時也要這一步：session 已寫回 storage，頁面仍停在 `#/login`，不 `reload` 就不會離開登入頁。

觸發步驟都在重播檔裡時：

```bash
"$CDP_DIR/bin/chrome-cdp" restore <t> --file .frontend-qa/<run>/checkpoint.json --format json
"$CDP_DIR/bin/chrome-cdp" reload <t>
"$CDP_DIR/bin/chrome-cdp" perceive <t>
"$CDP_DIR/bin/chrome-cdp" replay <t> --file .frontend-qa/<run>/repro/F<n>.actions.json --format json
"$CDP_DIR/bin/chrome-cdp" flow <t> "assert selector …; assert text …" --format json
```

觸發步驟是連點的 `eval` 時，`replay` 只會做連點之前的步驟。把同一個 `eval` 放進後面的 `flow`，再導到斷言要看的畫面。`eval` 那一步不能含分號：

```bash
"$CDP_DIR/bin/chrome-cdp" restore <t> --file .frontend-qa/<run>/checkpoint.json --format json
"$CDP_DIR/bin/chrome-cdp" reload <t>
"$CDP_DIR/bin/chrome-cdp" perceive <t>
"$CDP_DIR/bin/chrome-cdp" replay <t> --file .frontend-qa/<run>/repro/F<n>.actions.json --format json
"$CDP_DIR/bin/chrome-cdp" flow <t> "eval (()=>(document.querySelector('<sel>').click(), document.querySelector('<sel>').click()))(); wait network idle; nav <list-url>; wait network idle; assert selector-missing <css>" --format json
```

`replay` 用的是 selector，不依賴 `@ref`。上面這些步驟不需要 LLM，也不需要 Playwright。只跑 `replay` 再跑一個不含 `eval` 的斷言，連點的 bug 還在也會通過。省掉 `reload` 時，前端已經換成修好的版本也會得到 `failureKind` `assertion`。

| 結果 | 怎麼處理 | finding 的「重播」寫法 |
|---|---|---|
| `replay` 的 `failed` 是 0、`skipped` 是 0，flow 的 `failureKind` 是 `assertion` | 符合預期 | `repro/F<n>.actions.json`（replay 通過，flow 斷言失敗，符合預期） |
| flow 通過 | 斷言沒有抓到 bug，改寫 flow 和 spec 的斷言 | — |
| `replay` 有 `failed` 或 `skipped` | 重播檔或乾淨狀態不對（含密碼被遮蔽），修好再跑 | — |

spec 另外照下面確認。沒有 Playwright 時，複驗仍然用上面的 `replay` 加 flow，spec 標未執行即可。`QA_PASSWORD` 要事先放在環境變數裡，不要直接寫在指令上，否則密碼會留在對話紀錄。spec 不包含登入段落，密碼只活在 `_login.ts` 讀到的環境變數裡。

```bash
cd .frontend-qa/<run>/repro && npx --no-install playwright --version   # 要 1.51 以上
cd .frontend-qa/<run>/repro && BASE_URL=<網址> npx --no-install playwright test --reporter=line
```

| 結果 | 怎麼處理 | finding 的「重現腳本」寫法 |
|---|---|---|
| 失敗在「斷言」 | 符合預期 | `repro/F<n>.spec.ts`（目前失敗，符合預期） |
| 通過 | 斷言沒有抓到 bug，改寫斷言 | — |
| 失敗在「前置」 | 設定錯誤（登入、selector、網址，或 mock 沒攔到請求、計數是 0），修好再跑 | — |
| `npx --no-install` 找不到 Playwright，或出現 `Executable doesn't exist`（沒裝瀏覽器） | 不要自己安裝 | `repro/F<n>.spec.ts`（未執行：沒有 Playwright） |
| 版本低於 1.51（舊版會默默忽略 `filter({ visible: true })`，隱藏元素也會被比對到） | 不要執行 | `repro/F<n>.spec.ts`（未執行：Playwright 版本 < 1.51） |
| 錯誤發生在兩段之外（`Cannot find module '@playwright/test'`、語法錯誤、No tests found） | 語法錯誤就修好再跑；其他不要自己安裝 | `repro/F<n>.spec.ts`（未執行：<原因>） |
| 需要登入但沒有可用的密碼 | 不要寫死密碼 | `repro/F<n>.spec.ts`（未執行：沒有測試帳號密碼） |

## 複驗

跨次執行時，腳本在 `state/repro/`（見 [memory.md](memory.md#結束前更新狀態檔)）。`_login.ts` 全專案共用一份。`*.actions.json` 一起保留，給 `重播:` 使用。`checkpoint.json` 含 cookie 和 storage，不能複製到 `state/`。

使用者要確認問題修好了沒有時，不需要重新測試，也不需要 Playwright。每個 P0、P1 用上面「驗證腳本」的同一組指令：會寫入的項目先重設後端，再 `restore`、`reload`、`perceive`、`replay`、`flow`。`reload` 放在 `restore` 和 `perceive` 之間。`restore` 不會重新載入頁面，所以前端重新部署或換了 variant 之後，分頁仍跑舊的程式，修好的 bug 會被誤判成仍存在；`reload` 留下還原後的 session，並載入現在的前端。連點的 `flow` 必須包含同一個 `eval`。

- `replay` 成功且 flow 通過：標成「已修」
- `replay` 成功且 flow 的 `failureKind` 是 `assertion`：標成「仍存在」
- `replay` 失敗或被跳過：可能是畫面改版或乾淨狀態已不能還原，交給 agent 照文字重現步驟判斷，必要時更新重播檔
- 會寫入資料的項目，只在非正式環境跑；正式環境照 [critic.md](critic.md#怎麼驗證) 的「有副作用的 finding」

spec 可以另跑，作為交給 CI 的同一份斷言。沒有 Playwright 時跳過這段，不影響上面的複驗：

```bash
cd .frontend-qa/<run>/repro && BASE_URL=<網址> npx --no-install playwright test --reporter=json > result.json
```

- 通過：和 flow 一致才標成「已修」
- 失敗在「斷言」：標成「仍存在」
- 失敗在「前置」：可能是畫面改版，交給 agent 照文字重現步驟判斷，必要時更新腳本
- 第一行有 `// 會寫入` 的腳本，只在非正式環境跑
