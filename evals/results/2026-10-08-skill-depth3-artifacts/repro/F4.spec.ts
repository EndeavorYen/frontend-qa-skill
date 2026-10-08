// F4 [P1] A 500 on create navigates to #/orders/undefined.
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('a 500 on create stays on the form and shows an error', async ({ page }) => {
  let injected = 0;
  await test.step('setup', async () => {
    await login(page);
    await page.goto(BASE + '/#/orders/new');
    await expect(page.getByRole('heading', { name: '建立訂單', exact: true })).toBeVisible();
    await page.locator('[name=customer]').fill('ERR-A');
    await page.locator('[name=item]').fill('五百');
    await page.locator('[name=qty]').fill('1');
    await page.locator('[name=price]').fill('4');
    await page.route(
      (url) => url.pathname === '/api/orders',
      (r) => {
        if (r.request().method() === 'GET') return r.continue();
        injected++;
        return r.fulfill({ status: 500, body: '{}' });
      },
    );
    await page.locator('#order button.btn-primary').click();
    await expect.poll(() => injected).toBeGreaterThan(0);
  });
  await test.step('assert', async () => {
    await expect(page).toHaveURL(/#\/orders\/new/);
    await expect(page.getByText(/失敗|錯誤|無法/).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('找不到頁面').filter({ visible: true })).toHaveCount(0);
  });
});
