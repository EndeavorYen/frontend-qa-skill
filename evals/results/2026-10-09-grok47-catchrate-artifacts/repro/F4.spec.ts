import { expect, test } from '@playwright/test';
import { login } from './_login';

test('saving settings keeps the display name', async ({ page }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.goto((process.env.BASE_URL || 'http://localhost:4173') + '/#/settings');
    await expect(page.getByRole('heading', { name: '設定', exact: true })).toBeVisible();
  });

  await test.step('斷言', async () => {
    await page.locator('[name=name]').fill('QA顯示名稱');
    await page.getByRole('button', { name: '儲存' }).click();
    await expect(page.getByText(/已儲存|儲存成功/).filter({ visible: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.locator('[name=name]')).toHaveValue('QA顯示名稱');
  });
});
