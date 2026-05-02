import { test, expect } from '@playwright/test';

test.describe('arc detail', () => {
  // Phase 4 will add real fetching + assertions on the signal thread.
  test('navigating to an arc URL renders the detail view', async ({ page }) => {
    await page.goto('/arcs/sample-id');
    await expect(page.getByText(/Arc sample-id/)).toBeVisible();
  });
});
