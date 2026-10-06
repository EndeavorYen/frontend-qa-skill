# 重現腳本

P0 和 P1 除了文字的重現步驟，還要有一份 Playwright 重現腳本。之後要確認修好了沒有，直接跑腳本就好，不需要再派 agent 重測。

腳本的斷言寫「**修好之後應該成立的事**」，所以：
- bug 還在：腳本失敗
- bug 修好：腳本通過

## 什麼時候寫

P0、P1 第二次從乾淨狀態重現成功之後。檔案放在 `.frontend-qa/<run>/repro/F<n>.spec.ts`，F 編號和 `findings.md` 相同。沒有 Playwright 也要寫，只是不能執行。

## 怎麼寫

1. 重現的時候用 chrome-cdp-ex 操作，結束後跑 `export-playwright <t>`，拿它的輸出當草稿。草稿通常**不能直接用**：
   - 可能少了登入步驟，也可能帶著登入時填的明文密碼。**刪掉草稿中的登入段落**，一律改用共用的 `repro/_login.ts`
   - `eval` 做的操作（例如連點）不會匯出
   - 沒有任何斷言
2. `_login.ts` 的網址用 `BASE_URL` 環境變數，密碼用 `QA_PASSWORD` 環境變數。**密碼不能寫進任何檔案**，登入失敗時也不能為了讓腳本跑起來就寫死
3. 用 `test.step` 把腳本分成「前置」和「斷言」兩段。前置的最後一步一定要有一個**正向錨點**：確認現在真的在要測的畫面、而且畫面已經載入，例如 `await expect(page).toHaveURL(/projects\/new/)` 或 `await expect(page.getByRole('heading', { name: '新增專案' })).toBeVisible()`。沒有錨點的話，登入失效、被導回首頁時，「某個東西不見了」這類斷言會直接通過，被誤判成已修
4. 補上觸發 bug 的那一步：

| 情境 | 寫法 |
|---|---|
| 連點 | `page.evaluate(() => { const b = document.querySelector('<sel>'); b.click(); b.click(); })`，同一個 task 內點兩次 |
| API 回錯誤 | `page.route('**/api/<路徑>', (r) => r.fulfill({ status: 500, body: '{}' }))` |
| 斷網 | `context.setOffline(true)` |
| 手機尺寸 | `test.use({ viewport: { width: 390, height: 844 } })` |

5. 寫斷言，描述修好之後應該看到什麼。優先用「出現了什麼」的正向斷言；用「不見了」「數量是 0」這類否定斷言時，前面一定要有第 3 點的錨點。找文字時加上 `filter({ visible: true })`，因為表單常常預先埋了隱藏的錯誤元素：

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
    await expect(page.getByRole('heading', { name: '專案' })).toBeVisible();
    await page.getByRole('columnheader', { name: '到期日' }).click();
  });
  await test.step('斷言', async () => {
    await expect(page.locator('tbody tr').first()).toContainText('2026-01-03');
  });
});
```

## 會寫入資料的腳本

腳本會真的操作 app。會建立、修改資料，或觸發付款、寄信的腳本：
- 第一行註解加上 `// 會寫入：<寫入什麼>`
- 能只計數、不需要真的寫入的（例如連點檢查），用 `page.route` 攔截寫入請求，回一個假的成功回應
- 遵守步驟 0 的禁止動作。正式環境不跑這類腳本

## 驗證腳本

寫完要確認腳本在**目前的 app 上會失敗**，而且失敗在「斷言」那一段，不是「前置」：

```bash
cd .frontend-qa/<run>/repro && BASE_URL=<網址> QA_PASSWORD=<密碼> npx --no-install playwright test --reporter=line
```

| 結果 | 怎麼處理 | finding 的「重現腳本」寫法 |
|---|---|---|
| 失敗在「斷言」 | 符合預期 | `repro/F<n>.spec.ts`（目前失敗，符合預期） |
| 通過 | 斷言沒有抓到 bug，改寫斷言 | — |
| 失敗在「前置」 | 設定錯誤（登入、selector、網址），修好再跑 | — |
| `npx --no-install` 找不到 Playwright，或出現 `Executable doesn't exist`（沒裝瀏覽器） | 不要自己安裝 | `repro/F<n>.spec.ts`（未執行：沒有 Playwright） |

## 複驗

使用者要確認問題修好了沒有時，先跑全部腳本，不需要重新測試：

```bash
cd .frontend-qa/<run>/repro && BASE_URL=<網址> QA_PASSWORD=<密碼> npx --no-install playwright test --reporter=json > result.json
```

- 通過：標成「已修」
- 失敗在「斷言」：標成「仍存在」
- 失敗在「前置」：可能是畫面改版，交給 agent 照文字重現步驟判斷，必要時更新腳本
- 第一行有 `// 會寫入` 的腳本，只在非正式環境跑
