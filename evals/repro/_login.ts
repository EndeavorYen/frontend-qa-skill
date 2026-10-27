import type { Page } from '@playwright/test';
export const BASE = process.env.BASE_URL || 'http://localhost:4173';
export async function login(page: Page) {
  const password = process.env.QA_PASSWORD;
  if (!password) throw new Error('QA_PASSWORD is unset. Set it in the environment before running this spec.');
  await page.goto(BASE + '/#/login');
  await page.locator('[name=user]').fill('qa-user');
  await page.locator('[name=password]').fill(password);
  await page.locator('form button').click();
  await page.waitForURL(/#\/orders/);
}
