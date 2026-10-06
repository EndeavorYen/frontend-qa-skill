// B6 [P1] 設定顯示「已儲存」，重新整理後恢復原狀
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';
test('儲存的顯示名稱在重新整理後仍然保留', async ({ page }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.goto(BASE + '/#/settings');
    await expect(page.getByRole('heading', { name: '設定', exact: true })).toBeVisible();
    await page.locator('[name=name]').fill('改過的名稱');
    await page.getByRole('button', { name: '儲存' }).click();
    await expect(page.getByText('已儲存').filter({ visible: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: '設定', exact: true })).toBeVisible();
  });
  await test.step('斷言', async () => {
    await expect(page.locator('[name=name]')).toHaveValue('改過的名稱');
  });
});
