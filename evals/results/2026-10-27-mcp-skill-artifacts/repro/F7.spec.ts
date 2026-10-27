// 會寫入：建立一筆客戶為 F7 的訂單
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('F7 數量為負數時不能建立訂單', async ({ page }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.goto(BASE + '/#/orders/new');
    await expect(page.getByRole('heading', { name: '建立訂單' })).toBeVisible();
    await page.getByRole('textbox', { name: '客戶名稱' }).fill('F7');
    await page.getByRole('textbox', { name: '品項' }).fill('neg');
    await page.getByRole('spinbutton', { name: '數量' }).fill('-3');
    await page.getByRole('spinbutton', { name: '單價' }).fill('100');
    await page.getByRole('button', { name: '送出訂單' }).click();
    await page.waitForTimeout(800);
  });
  await test.step('斷言', async () => {
    const list = await (await page.request.get(BASE + '/api/orders')).json();
    const bad = list.filter((o: { customer: string; qty: number }) => o.customer === 'F7' && Number(o.qty) <= 0);
    expect(bad, '數量 <= 0 的 F7 訂單').toHaveLength(0);
  });
});
