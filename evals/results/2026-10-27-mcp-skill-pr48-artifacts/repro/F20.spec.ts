import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('F20 離線送出要顯示失敗訊息', async ({ page, context }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.goto(BASE + '/#/orders/new');
    await page.getByRole('textbox', { name: '客戶名稱' }).fill('F20');
    await page.getByRole('textbox', { name: '品項' }).fill('offline');
    await page.getByRole('spinbutton', { name: '數量' }).fill('1');
    await page.getByRole('spinbutton', { name: '單價' }).fill('10');
    await context.setOffline(true);
  });
  await test.step('斷言', async () => {
    await page.getByRole('button', { name: '送出訂單' }).click();
    await expect(page.locator('main .error, main [role=alert]').first()).toBeVisible({ timeout: 3000 });
  });
});
