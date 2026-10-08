// F10 [P1] the completed filter still lists pending orders
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('the completed filter shows only completed orders', async ({ page }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.goto(BASE + '/#/orders');
    await expect(page.getByRole('heading', { name: '訂單', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '全部', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '已完成', exact: true }).click();
    await expect(page.getByRole('button', { name: '已完成', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  await test.step('斷言', async () => {
    const statuses = await page.locator('tbody tr td:nth-child(6)').allTextContents();
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) expect(status.trim()).toBe('已完成');
  });
});
