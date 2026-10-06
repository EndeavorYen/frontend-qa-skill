// B6 [P1] 設定顯示「已儲存」，重新整理後恢復原狀
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';
test('儲存的顯示名稱在重新整理後仍然保留', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/#/settings');
  await page.locator('[name=name]').fill('改過的名稱');
  await page.getByRole('button', { name: '儲存' }).click();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('[name=name]')).toHaveValue('改過的名稱');
});
