// F1 [P0] double-clicking submit creates two orders
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test('submitting a new order once creates only one order', async ({ page }) => {
  const customer = `QA-DUP-${Date.now()}`;
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.url().includes('/api/orders')) writes.push(r.url());
  });

  await test.step('前置', async () => {
    await login(page);
    await page.goto(BASE + '/#/orders/new');
    await expect(page).toHaveURL(/#\/orders\/new/);
    await expect(page.getByRole('heading', { name: '建立訂單', exact: true })).toBeVisible();
    await page.locator('[name=customer]').fill(customer);
    await page.locator('[name=item]').fill('連點品項');
    await page.locator('[name=qty]').fill('1');
    await page.locator('[name=price]').fill('50');
  });

  await test.step('斷言', async () => {
    await page.evaluate(() => {
      const b = document.querySelector('form#order button.btn-primary') as HTMLButtonElement;
      b.click();
      b.click();
    });
    await expect.poll(() => writes.length).toBeGreaterThan(0);
    await page.waitForTimeout(1000);
    expect(writes.length).toBe(1);
    const orders = await page.evaluate(async (name) => {
      const list = await (await fetch('/api/orders')).json();
      return list.filter((o: { customer: string }) => o.customer === name).length;
    }, customer);
    expect(orders).toBe(1);
  });
});
