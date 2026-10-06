import type { Page } from '@playwright/test';
export const BASE = process.env.BASE_URL || 'http://localhost:4173';
// seeded-app 接受任意帳號密碼；照 repro.md 的規則，密碼仍然從環境變數讀
export async function login(page: Page) {
  await page.goto(BASE + '/#/login');
  await page.locator('[name=user]').fill('qa-user');
  await page.locator('[name=password]').fill(process.env.QA_PASSWORD ?? 'any-password');
  await page.locator('form button').click();
  await page.waitForURL(/#\/orders/);
}
