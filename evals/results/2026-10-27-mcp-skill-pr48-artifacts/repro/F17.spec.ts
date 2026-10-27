import { test, expect } from '@playwright/test';
import { BASE, login } from './_login';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('F17 手機上送出按鈕不被固定頁尾蓋住', async ({ page }) => {
  await test.step('前置', async () => {
    await login(page);
    await page.goto(BASE + '/#/orders/new');
    await page.getByRole('button', { name: '送出訂單' }).click();
  });
  await test.step('斷言', async () => {
    const covered = await page.getByRole('button', { name: '送出訂單' }).evaluate((b: HTMLElement) => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const r = b.getBoundingClientRect();
      const e = document.elementFromPoint(r.left + r.width / 2, r.bottom - 2);
      return !(e && b.contains(e));
    });
    expect(covered, '按鈕下緣被其他元素蓋住').toBe(false);
  });
});
