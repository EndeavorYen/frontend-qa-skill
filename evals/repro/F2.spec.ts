// B2 [P1] 手機版「送出訂單」被固定 footer 擋住
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';
test.use({ viewport: { width: 390, height: 844 } });
test('手機上送出按鈕的中心點沒有被其他元素蓋住', async ({ page }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.goto(BASE + '/#/orders/new');
    await expect(page.getByRole('heading', { name: '建立訂單' })).toBeVisible();
  });
  await test.step('斷言', async () => {
    const covered = await page.locator('button.btn-primary').evaluate((b) => {
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !(top && (top === b || b.contains(top)));
    });
    expect(covered).toBe(false);
  });
});
