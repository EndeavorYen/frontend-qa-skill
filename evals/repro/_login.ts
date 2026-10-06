import type { Page } from '@playwright/test';
export const BASE = process.env.BASE_URL || 'http://localhost:4173';
// 照 repro.md 的規則，密碼從環境變數讀（seeded-app 接受任意非空密碼）
export async function login(page: Page) {
  await page.goto(BASE + '/#/login');
  await page.locator('[name=user]').fill('qa-user');
  await page.locator('[name=password]').fill(process.env.QA_PASSWORD ?? '');
  await page.locator('form button').click();
  await page.waitForURL(/#\/orders/);
}
