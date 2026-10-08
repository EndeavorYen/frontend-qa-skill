// F3 [P1] The order list stays on 載入中 when the API returns 500.
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('a 500 from the list API shows an error instead of a spinner', async ({ page }) => {
  let injected = 0;
  await test.step('setup', async () => {
    await login(page);
    await page.goto(BASE + '/#/orders');
    await expect(page.getByRole('heading', { name: '訂單', exact: true })).toBeVisible();
    await page.route(
      (url) => url.pathname === '/api/orders',
      (r) => {
        injected++;
        return r.fulfill({ status: 500, body: '{}' });
      },
    );
    await page.reload();
    await expect.poll(() => injected).toBeGreaterThan(0);
  });
  await test.step('assert', async () => {
    await expect(page.getByText('載入中').filter({ visible: true })).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByText(/失敗|錯誤|無法|重試/).filter({ visible: true }).first()).toBeVisible();
  });
});
