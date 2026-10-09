import { expect, test } from '@playwright/test';
import { login } from './_login';

test('offline submit shows an error', async ({ page, context }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.goto((process.env.BASE_URL || 'http://localhost:4173') + '/#/orders/new');
    await expect(page.getByRole('heading', { name: '建立訂單', exact: true })).toBeVisible();
    await page.locator('[name=customer]').fill('QA離線');
    await page.locator('[name=item]').fill('x');
    await page.locator('[name=qty]').fill('1');
    await page.locator('[name=price]').fill('2');
  });

  await test.step('斷言', async () => {
    await context.setOffline(true);
    await page.locator('form button').click();
    await expect(page.getByText(/失敗|錯誤|無法|離線|請稍後/).filter({ visible: true }).first()).toBeVisible({
      timeout: 5000,
    });
  });
});
