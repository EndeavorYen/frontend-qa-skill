import { expect, test } from '@playwright/test';
import { login } from './_login';

test('negative quantity is rejected', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/orders')) posts.push(request.url());
  });

  await test.step('前置', async () => {
    await login(page);
    await page.goto((process.env.BASE_URL || 'http://localhost:4173') + '/#/orders/new');
    await expect(page.getByRole('heading', { name: '建立訂單', exact: true })).toBeVisible();
    await page.locator('[name=customer]').fill('QA-neg');
    await page.locator('[name=item]').fill('item');
    await page.locator('[name=qty]').fill('-1');
    await page.locator('[name=price]').fill('100');
  });

  await test.step('斷言', async () => {
    await page.locator('form button').click();
    await page.waitForTimeout(1000);
    expect(posts).toHaveLength(0);
    await expect(page).toHaveURL(/#\/orders\/new/);
    await expect(page.locator('.error').filter({ visible: true })).toContainText(/數量/);
  });
});
