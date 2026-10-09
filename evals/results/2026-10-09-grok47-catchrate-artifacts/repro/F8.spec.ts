import { expect, test } from '@playwright/test';
import { login } from './_login';

test('login does not restore an empty cancelled filter without explanation', async ({ page }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.goto((process.env.BASE_URL || 'http://localhost:4173') + '/#/orders');
    await expect(page.getByRole('heading', { name: '訂單', exact: true })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await page.getByRole('button', { name: '已取消' }).click();
    await page.getByRole('button', { name: '登出' }).click();
    await expect(page).toHaveURL(/#\/login/);
  });

  await test.step('斷言', async () => {
    await login(page);
    await expect(page.getByRole('heading', { name: '訂單', exact: true })).toBeVisible();
    const cancelled = page.getByRole('button', { name: '已取消' });
    const pressed = await cancelled.getAttribute('aria-pressed');
    if (pressed === 'true') {
      await expect(page.getByText(/沒有|無資料|尚無/).filter({ visible: true }).first()).toBeVisible();
    } else {
      await expect(page.locator('tbody tr').first()).toBeVisible();
    }
  });
});
