// F3 [P1] a 500 from create order navigates to #/orders/undefined
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('a failed create stays on the form and shows an error', async ({ page }) => {
  let injected = 0;
  await page.route(
    (url) => url.pathname === '/api/orders',
    (r) => {
      if (r.request().method() === 'GET') return r.continue();
      injected += 1;
      return r.fulfill({ status: 500, body: '{}' });
    },
  );

  await test.step('前置', async () => {
    await login(page);
    await page.goto(BASE + '/#/orders/new');
    await expect(page).toHaveURL(/#\/orders\/new/);
    await expect(page.getByRole('heading', { name: '建立訂單', exact: true })).toBeVisible();
    await page.locator('[name=customer]').fill('QA-FAIL');
    await page.locator('[name=item]').fill('失敗品項');
    await page.locator('[name=qty]').fill('1');
    await page.locator('[name=price]').fill('20');
    await page.locator('form#order button.btn-primary').click();
    await expect.poll(() => injected).toBeGreaterThan(0);
  });

  await test.step('斷言', async () => {
    await expect(page).toHaveURL(/#\/orders\/new/);
    await expect(page.getByRole('heading', { name: '建立訂單', exact: true })).toBeVisible();
    await expect(page.getByText(/失敗|錯誤|無法/).filter({ visible: true }).first()).toBeVisible();
  });
});
