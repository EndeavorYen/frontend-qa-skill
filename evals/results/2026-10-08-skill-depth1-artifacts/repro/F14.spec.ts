// F14 [P1] saving settings does not persist the display name
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('saving the display name keeps it after reload', async ({ page }) => {
  const name = `QA顯示${Date.now()}`;

  await test.step('前置', async () => {
    await login(page);
    await page.goto(BASE + '/#/settings');
    await expect(page).toHaveURL(/#\/settings/);
    await expect(page.getByRole('heading', { name: '設定', exact: true })).toBeVisible();
    await page.locator('[name=name]').fill(name);
    await page.locator('form#settings button.btn-primary').click();
  });

  await test.step('斷言', async () => {
    await expect(page.getByText(/已儲存|成功/).filter({ visible: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: '設定', exact: true })).toBeVisible();
    await expect(page.locator('[name=name]')).toHaveValue(name);
  });
});
