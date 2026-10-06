// B20 [P1] 離線送出訂單時畫面沒有任何反應
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';
test('離線送出時 5 秒內出現看得見的錯誤訊息', async ({ page, context }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.goto(BASE + '/#/orders/new');
    await expect(page.getByRole('heading', { name: '建立訂單', exact: true })).toBeVisible();
    await page.locator('[name=customer]').fill('重現客戶');
    await page.locator('[name=item]').fill('重現品項');
    await page.locator('[name=qty]').fill('1');
    await page.locator('[name=price]').fill('100');
    await context.setOffline(true);
    await page.locator('button.btn-primary').click();
  });
  await test.step('斷言', async () => {
    await expect(page.getByText(/失敗|錯誤|無法|離線|請稍後/).filter({ visible: true }).first()).toBeVisible({ timeout: 5000 });
  });
});
