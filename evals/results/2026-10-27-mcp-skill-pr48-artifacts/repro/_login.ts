// repro/_login.ts
import type { Page } from '@playwright/test';
export const BASE = process.env.BASE_URL || 'http://localhost:4173';
export async function login(page: Page) {
  const password = process.env.QA_PASSWORD;
  if (!password) throw new Error('QA_PASSWORD is unset. Set it in the environment before running this spec.');
  await page.goto(BASE + '/#/login');
  await page.getByRole('textbox', { name: '帳號' }).fill('qa');
  await page.getByRole('textbox', { name: '密碼' }).fill(password);
  await page.getByRole('button', { name: '登入' }).click();
  await page.waitForURL(/#\/orders/);
}
