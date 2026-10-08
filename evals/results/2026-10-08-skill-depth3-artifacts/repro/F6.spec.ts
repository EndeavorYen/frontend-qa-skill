// F6 [P1] Saving settings does not persist.
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('saving settings keeps the display name after reload', async ({ page }) => {
  const name = `saved-${Date.now()}`;
  await test.step('setup', async () => {
    await login(page);
    await page.goto(BASE + '/#/settings');
    await expect(page.getByRole('heading', { name: '設定', exact: true })).toBeVisible();
    await page.locator('[name=name]').fill(name);
    await page.locator('#settings button.btn-primary').click();
  });
  await test.step('assert', async () => {
    await expect(page.getByText(/已儲存|已更新/).filter({ visible: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: '設定', exact: true })).toBeVisible();
    await expect(page.locator('[name=name]')).toHaveValue(name);
  });
});
