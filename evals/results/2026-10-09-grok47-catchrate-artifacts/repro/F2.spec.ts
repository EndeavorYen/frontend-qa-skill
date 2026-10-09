import { expect, test } from '@playwright/test';
import { login } from './_login';

test('double-clicking submit creates one order', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/orders')) posts.push(request.url());
  });
  await page.route(
    (url) => url.pathname === '/api/orders',
    (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 201, contentType: 'application/json', body: '{"id":1}' })
        : route.continue(),
  );

  await test.step('前置', async () => {
    await login(page);
    await page.goto((process.env.BASE_URL || 'http://localhost:4173') + '/#/orders/new');
    await expect(page.getByRole('heading', { name: '建立訂單', exact: true })).toBeVisible();
    await page.locator('[name=customer]').fill('QA-double-spec');
    await page.locator('[name=item]').fill('dbl');
    await page.locator('[name=qty]').fill('1');
    await page.locator('[name=price]').fill('10');
  });

  await test.step('斷言', async () => {
    await page.evaluate(() => {
      const button = document.querySelector('form button');
      if (button instanceof HTMLElement) {
        button.click();
        button.click();
      }
    });
    await expect.poll(() => posts.length).toBeGreaterThan(0);
    await page.waitForTimeout(1000);
    expect(posts.length).toBe(1);
  });
});
