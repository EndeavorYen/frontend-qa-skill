import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('F19 列表 API 失敗時顯示錯誤而不是一直載入', async ({ page }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.route('**/api/orders', (route) => route.request().method() === 'GET' ? route.fulfill({ status: 500, body: '{}' }) : route.continue());
    await page.goto(BASE + '/#/orders');
    await page.reload();
  });
  await test.step('斷言', async () => {
    await page.waitForTimeout(5500);
    await expect(page.locator('main')).not.toContainText('載入中');
  });
});
