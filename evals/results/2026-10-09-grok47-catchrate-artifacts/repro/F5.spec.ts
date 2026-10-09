import { expect, test } from '@playwright/test';
import { login } from './_login';

test('orders list explains an API failure', async ({ page }) => {
  let injected = 0;
  await page.route(
    (url) => url.pathname === '/api/orders',
    (route) => {
      injected += 1;
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    },
  );

  await test.step('前置', async () => {
    await login(page);
    await page.goto((process.env.BASE_URL || 'http://localhost:4173') + '/#/orders');
    await expect(page.getByRole('heading', { name: '訂單', exact: true })).toBeVisible();
    await expect.poll(() => injected).toBeGreaterThan(0);
  });

  await test.step('斷言', async () => {
    await expect(page.getByText(/失敗|錯誤|無法|請稍後/).filter({ visible: true }).first()).toBeVisible({
      timeout: 5000,
    });
  });
});
