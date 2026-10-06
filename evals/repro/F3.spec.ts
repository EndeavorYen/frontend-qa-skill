// B3 [P1] 列表 API 失敗時「載入中…」永遠不會消失
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';
test('列表 API 回 500 時，5 秒內不再顯示載入中', async ({ page }) => {
  let injected = 0;
  await test.step('前置', async () => {
    await login(page);
    // 用函式比對，網址加了 query 也攔得到；計數用來證明 500 真的送出去了
    await page.route((url) => url.pathname === '/api/orders', (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      injected++;
      return route.fulfill({ status: 500, body: '{}' });
    });
    await page.reload();
    await expect(page).toHaveURL(/#\/orders$/);
    await expect(page.getByRole('heading', { name: '訂單', exact: true })).toBeVisible();
    await expect.poll(() => injected).toBeGreaterThan(0);
  });
  await test.step('斷言', async () => {
    await expect(page.getByText('載入中').filter({ visible: true })).toHaveCount(0, { timeout: 5000 });
  });
});
