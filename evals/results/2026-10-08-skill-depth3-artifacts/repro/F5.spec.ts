// F5 [P1] Submitting the order form while offline shows no feedback.
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('submitting a new order while offline shows an error', async ({ page }) => {
  await test.step('setup', async () => {
    await login(page);
    await page.goto(BASE + '/#/orders/new');
    await expect(page.getByRole('heading', { name: '建立訂單', exact: true })).toBeVisible();
    await page.locator('[name=customer]').fill('OFF-A');
    await page.locator('[name=item]').fill('離線品');
    await page.locator('[name=qty]').fill('1');
    await page.locator('[name=price]').fill('3');
    await page.context().setOffline(true);
    await page.locator('#order button.btn-primary').click();
  });
  await test.step('assert', async () => {
    await expect(page).toHaveURL(/#\/orders\/new/);
    await expect(page.getByText(/失敗|錯誤|無法|離線/).filter({ visible: true }).first()).toBeVisible();
    await expect(page.locator('[name=customer]')).toHaveValue('OFF-A');
  });
});
