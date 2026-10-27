import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('F11 設定儲存會送出請求並在重新整理後保留', async ({ page }) => {
  let writes = 0;
  await test.step('前置', async () => {
    await login(page);
    page.on('request', (r) => { if (r.method() !== 'GET' && r.url().includes('/api/')) writes++; });
    await page.goto(BASE + '/#/settings');
  });
  await test.step('斷言', async () => {
    await page.locator('main input').first().fill('repro-name');
    await page.getByRole('button', { name: '儲存' }).click();
    await page.waitForTimeout(1000);
    expect(writes, '寫入請求筆數').toBeGreaterThan(0);
    await page.reload();
    await expect(page.locator('main input').first()).toHaveValue('repro-name');
  });
});
