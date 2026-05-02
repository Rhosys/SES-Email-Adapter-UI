import { test, expect } from '@playwright/test';

test.describe('onboarding', () => {
  // Phase 2 will replace this with the full 5-step wizard flow.
  test('the onboarding placeholder mentions the five steps', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page.getByRole('heading', { name: 'Onboarding' })).toBeVisible();
    await expect(page.getByText(/5-step wizard/i)).toBeVisible();
  });
});
