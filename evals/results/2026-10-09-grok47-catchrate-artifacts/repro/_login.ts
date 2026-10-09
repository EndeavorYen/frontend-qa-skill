import type { Page } from '@playwright/test';

export const BASE = process.env.BASE_URL || 'http://localhost:4173';

export async function login(page: Page) {
  await page.goto(BASE + '/#/login');
  await page.locator('[name=user]').fill('qa-user@example.com');
  await page.locator('[name=password]').fill(process.env.QA_PASSWORD ?? '');
  await page.locator('form button').click();
  await page.waitForURL(/#\/orders/);
}
