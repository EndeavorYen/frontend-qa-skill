// F1 [P0] Double-clicking submit creates two identical orders.
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('submitting an order creates exactly one row', async ({ page }) => {
  const name = `QA-DBL-${Date.now()}`;
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/orders')) writes.push(r.url());
  });
  await test.step('setup', async () => {
    await login(page);
    await page.goto(BASE + '/#/orders/new');
    await expect(page.getByRole('heading', { name: '建立訂單', exact: true })).toBeVisible();
    await page.locator('[name=customer]').fill(name);
    await page.locator('[name=item]').fill('連點品');
    await page.locator('[name=qty]').fill('1');
    await page.locator('[name=price]').fill('9');
    await page.locator('[name=note]').fill('dbl');
  });
  await test.step('assert', async () => {
    await page.evaluate(() => {
      const b = document.querySelector('#order button.btn-primary') as HTMLButtonElement;
      b.click();
      b.click();
    });
    await expect.poll(() => writes.length).toBeGreaterThan(0);
    await page.waitForTimeout(1000);
    expect(writes.length).toBe(1);
    await page.goto(BASE + '/#/orders');
    await expect(page.getByRole('heading', { name: '訂單', exact: true })).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: name })).toHaveCount(1);
  });
});
