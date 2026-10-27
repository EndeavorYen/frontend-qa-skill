import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('F8 已完成篩選只列已完成', async ({ page }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.goto(BASE + '/#/orders');
  });
  await test.step('斷言', async () => {
    await page.getByRole('button', { name: '已完成' }).click();
    const statuses = await page.locator('main tbody tr td:nth-child(6)').allInnerTexts();
    expect(statuses.length).toBeGreaterThan(0);
    for (const s of statuses) expect(s.trim()).toBe('已完成');
  });
});
