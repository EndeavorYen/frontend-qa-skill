// B3 [P1] 列表 API 失敗時「載入中…」永遠不會消失
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';
test('列表 API 回 500 時，5 秒內不再顯示載入中', async ({ page }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.route('**/api/orders', (route) => (route.request().method() === 'GET' ? route.fulfill({ status: 500, body: '{}' }) : route.continue()));
    await page.reload();
    await expect(page).toHaveURL(/#\/orders$/);
    await expect(page.getByRole('heading', { name: '訂單' })).toBeVisible();
  });
  await test.step('斷言', async () => {
    await expect(page.getByText('載入中').filter({ visible: true })).toHaveCount(0, { timeout: 5000 });
  });
});
