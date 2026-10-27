import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('F6 連點送出訂單只送出一次', async ({ page }) => {
  let posts = 0;
  await test.step('前置', async () => {
    await login(page);
    await page.route('**/api/orders', async (route) => {
      if (route.request().method() === 'POST') {
        posts++;
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 9000 + posts }) });
      }
      return route.continue();
    });
    await page.goto(BASE + '/#/orders/new');
    await page.getByRole('textbox', { name: '客戶名稱' }).fill('F6');
    await page.getByRole('textbox', { name: '品項' }).fill('double');
    await page.getByRole('spinbutton', { name: '數量' }).fill('1');
    await page.getByRole('spinbutton', { name: '單價' }).fill('10');
  });
  await test.step('斷言', async () => {
    await page.getByRole('button', { name: '送出訂單' }).evaluate((b: HTMLElement) => { b.click(); b.click(); });
    await page.waitForTimeout(1000);
    expect(posts, '寫入請求筆數').toBe(1);
  });
});
