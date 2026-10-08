// F2 [P1] order list stays on the loading message when the API fails
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('a failed order list shows an error instead of spinning forever', async ({ page }) => {
  let injected = 0;
  await page.route(
    (url) => url.pathname === '/api/orders',
    (r) => {
      injected += 1;
      return r.fulfill({ status: 500, body: '{}' });
    },
  );

  await test.step('前置', async () => {
    await login(page);
    await page.goto(BASE + '/#/orders');
    await expect(page).toHaveURL(/#\/orders$/);
    await expect(page.getByRole('heading', { name: '訂單', exact: true })).toBeVisible();
    await expect.poll(() => injected).toBeGreaterThan(0);
  });

  await test.step('斷言', async () => {
    await expect(page.getByText(/失敗|錯誤|無法|再試/).filter({ visible: true }).first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText('載入中')).toHaveCount(0);
  });
});
