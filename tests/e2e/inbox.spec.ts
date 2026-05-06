import { test, expect } from '@playwright/test';

test.describe('inbox shell', () => {
  test('the app shell renders the sidebar and top bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
  });
});
