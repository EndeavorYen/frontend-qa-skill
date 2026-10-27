import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('F17 送出失敗時留在表單並保留輸入', async ({ page }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.route('**/api/orders', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
        : route.continue());
    await page.goto(BASE + '/#/orders/new');
    await expect(page.getByRole('heading', { name: '建立訂單' })).toBeVisible();
    await page.getByRole('textbox', { name: '客戶名稱' }).fill('F17');
    await page.getByRole('textbox', { name: '品項' }).fill('500');
    await page.getByRole('spinbutton', { name: '數量' }).fill('1');
    await page.getByRole('spinbutton', { name: '單價' }).fill('10');
    await page.getByRole('button', { name: '送出訂單' }).click();
    await page.waitForTimeout(1000);
  });
  await test.step('斷言', async () => {
    await expect(page.getByRole('heading', { name: '建立訂單' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: '客戶名稱' })).toHaveValue('F17');
  });
});
