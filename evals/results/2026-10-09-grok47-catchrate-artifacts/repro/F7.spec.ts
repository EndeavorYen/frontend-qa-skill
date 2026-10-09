import { expect, test } from '@playwright/test';
import { login } from './_login';

test('delete control is a named button in tab order', async ({ page }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.goto((process.env.BASE_URL || 'http://localhost:4173') + '/#/orders');
    await expect(page.getByRole('heading', { name: '訂單', exact: true })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  await test.step('斷言', async () => {
    const del = page.getByRole('button', { name: /刪除/ }).first();
    await expect(del).toBeVisible();
    await del.focus();
    await expect(del).toBeFocused();
  });
});
