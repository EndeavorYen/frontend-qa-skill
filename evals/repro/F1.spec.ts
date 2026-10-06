// B1 [P0] 連點「送出訂單」會建立重複的訂單
import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';
test('連點送出只會建立一筆訂單', async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/#/orders/new');
  await page.locator('[name=customer]').fill('重現客戶');
  await page.locator('[name=item]').fill('重現品項');
  await page.locator('[name=qty]').fill('1');
  await page.locator('[name=price]').fill('100');
  const posts: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/orders')) posts.push(r.url()); });
  await page.evaluate(() => { const b = document.querySelector<HTMLButtonElement>('button.btn-primary')!; b.click(); b.click(); });
  await page.waitForTimeout(2000);
  expect(posts.length).toBe(1);
});
