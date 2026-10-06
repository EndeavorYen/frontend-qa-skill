# 重現腳本

P0 和 P1 除了文字的重現步驟，還要有一份 Playwright 重現腳本。之後要確認修好了沒有，直接跑腳本就好，不需要再派 agent 重測。

腳本的斷言寫「**修好之後應該成立的事**」，所以：
- bug 還在：腳本失敗
- bug 修好：腳本通過

## 什麼時候寫

P0、P1 第二次從乾淨狀態重現成功之後。檔案放在 `.frontend-qa/<run>/repro/F<n>.spec.ts`，F 編號和 `findings.md` 相同。

## 怎麼寫

1. 重現的時候用 chrome-cdp-ex 操作，結束後跑 `export-playwright <t>`，拿它的輸出當草稿。草稿通常**不能直接用**：
   - 可能少了登入步驟
   - `eval` 做的操作（例如連點）不會匯出
   - 沒有任何斷言
2. 登入寫在共用的 `repro/_login.ts`，網址用 `BASE_URL` 環境變數，讓同一份腳本可以對不同環境跑
3. 補上觸發 bug 的那一步：

| 情境 | 寫法 |
|---|---|
| 連點 | `page.evaluate(() => { const b = document.querySelector('<sel>'); b.click(); b.click(); })`，同一個 task 內點兩次 |
| API 回錯誤 | `page.route('**/api/<路徑>', (r) => r.fulfill({ status: 500, body: '{}' }))` |
| 斷網 | `context.setOffline(true)` |
| 手機尺寸 | `test.use({ viewport: { width: 390, height: 844 } })` |

4. 寫一個斷言，描述修好之後應該看到什麼：

| bug 的樣子 | 斷言 |
|---|---|
| 重複送出 | 用 `page.on('request')` 計算寫入請求，`expect(count).toBe(1)` |
| 按鈕被擋住 | 按鈕中心點的 `document.elementFromPoint` 是按鈕本身或它的子元素 |
| 一直停在載入中 | `expect(page.getByText('載入中')).toBeHidden({ timeout: 5000 })` |
| 儲存了卻沒存 | 重新整理後 `toHaveValue('<新的值>')` |
| 失敗時沒有提示 | `expect(page.getByText(/失敗\|錯誤\|無法/)).toBeVisible({ timeout: 5000 })` |
| 畫面露出 `undefined`、`NaN` | `expect(page.getByText(/undefined\|NaN/)).toHaveCount(0)` |
| 沒有權限卻能操作 | `expect(page.getByRole('button', { name: '<名稱>' })).toBeDisabled()` |
| console 拋出例外 | 用 `page.on('pageerror')` 收集，`expect(errors).toEqual([])` |

範例：

```ts
// repro/_login.ts
import type { Page } from '@playwright/test';
export const BASE = process.env.BASE_URL || 'http://localhost:3000';
export async function login(page: Page) {
  await page.goto(BASE + '/login');
  await page.locator('[name=email]').fill('qa@example.com');
  await page.locator('[name=password]').fill(process.env.QA_PASSWORD || '');
  await page.locator('form button').click();
  await page.waitForURL(/dashboard/);
}

// repro/F4.spec.ts
// F4 [P1] 離線時按「儲存」沒有任何提示
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';
test('離線儲存時 5 秒內出現錯誤訊息', async ({ page, context }) => {
  await login(page);
  await page.goto(BASE + '/projects/new');
  await page.locator('[name=title]').fill('重現');
  await context.setOffline(true);
  await page.getByRole('button', { name: '儲存' }).click();
  await expect(page.getByText(/失敗|錯誤|無法|離線/)).toBeVisible({ timeout: 5000 });
});
```

密碼不要寫進腳本，用環境變數。

## 驗證腳本

寫完要確認腳本在**目前的 app 上會失敗**，而且失敗的原因是那個斷言，不是登入失敗、selector 找不到這類設定錯誤：

```bash
cd .frontend-qa/<run>/repro && BASE_URL=<網址> npx playwright test --reporter=line
```

- 本機要有 `@playwright/test`（`npx playwright --version` 有輸出）。沒有的話，不要自己全域安裝，在 finding 寫「重現腳本：未執行（沒有 Playwright）」
- 失敗原因是斷言：在 finding 寫「重現腳本：`repro/F<n>.spec.ts`（目前失敗，符合預期）」
- 腳本通過了：代表斷言沒有抓到 bug，改寫斷言
- 失敗原因是設定錯誤：修好腳本再跑

## 複驗

使用者要確認問題修好了沒有時，先跑全部腳本，不需要重新測試：

```bash
cd .frontend-qa/<run>/repro && BASE_URL=<網址> npx playwright test --reporter=json > result.json
```

- 通過：標成「已修」
- 斷言失敗：標成「仍存在」
- 其他錯誤（找不到元素、逾時）：可能是畫面改版，交給 agent 照文字重現步驟判斷，必要時更新腳本
