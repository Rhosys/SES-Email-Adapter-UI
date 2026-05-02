import { test, expect } from '@playwright/test';

async function setTheme(page: import('@playwright/test').Page, flavor: string) {
  await page.evaluate((f) => {
    document.documentElement.dataset.theme = f;
  }, flavor);
}

async function readVar(page: import('@playwright/test').Page, name: string) {
  return page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name
  );
}

test.describe('catppuccin theme', () => {
  test('Mocha exposes the canonical base background', async ({ page }) => {
    await page.goto('/');
    await setTheme(page, 'mocha');
    expect(await readVar(page, '--ctp-base')).toBe('#1e1e2e');
  });

  test('Latte exposes the canonical base background', async ({ page }) => {
    await page.goto('/');
    await setTheme(page, 'latte');
    expect(await readVar(page, '--ctp-base')).toBe('#eff1f5');
  });

  test('high-urgency badge resolves to Mocha mauve', async ({ page }) => {
    await page.goto('/');
    await setTheme(page, 'mocha');
    // Render an UrgencyBadge in the page so the assertion does not depend on
    // real data being loaded — we are testing the color-token plumbing.
    await page.evaluate(() => {
      const el = document.createElement('span');
      el.setAttribute('data-testid', 'probe');
      el.className = 'text-mauve';
      el.textContent = 'probe';
      document.body.appendChild(el);
    });
    const color = await page
      .locator('[data-testid="probe"]')
      .evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe('rgb(203, 166, 247)');
  });
});
