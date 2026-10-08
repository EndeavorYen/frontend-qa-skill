// F2 [P1] The 已完成 filter does not filter the list.
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('completed filter shows only completed orders', async ({ page }) => {
  await test.step('setup', async () => {
    await login(page);
    await page.goto(BASE + '/#/orders');
    await expect(page.getByRole('heading', { name: '訂單', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '已完成', exact: true }).click();
    await expect(page.getByRole('button', { name: '已完成', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
  await test.step('assert', async () => {
    const statuses = page.locator('tbody tr td:nth-child(6)');
    await expect(statuses.first()).toBeVisible();
    const count = await statuses.count();
    for (let i = 0; i < count; i++) {
      await expect(statuses.nth(i)).toHaveText('已完成');
    }
  });
});
