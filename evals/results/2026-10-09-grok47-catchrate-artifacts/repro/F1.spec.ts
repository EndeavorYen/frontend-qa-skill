import { expect, test } from '@playwright/test';
import { login } from './_login';

test.use({ viewport: { width: 390, height: 844 } });

test('submit stays clickable above the footer', async ({ page }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.goto((process.env.BASE_URL || 'http://localhost:4173') + '/#/orders/new');
    await expect(page).toHaveURL(/#\/orders\/new/);
    await expect(page.getByRole('heading', { name: '建立訂單', exact: true })).toBeVisible();
  });

  await test.step('斷言', async () => {
    const button = page.getByRole('button', { name: '送出訂單' });
    const hit = await button.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const node = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return node ? node.tagName : '';
    });
    expect(hit).toBe('BUTTON');
  });
});
