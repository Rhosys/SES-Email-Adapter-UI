import { test, expect, type Page } from '@playwright/test';

const API = '**/onboarding/**';

async function mockOnboardingApi(page: Page) {
  let signalReceivedCalls = 0;

  await page.route('**/onboarding/domain', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        domain: 'example.com',
        verified: false,
        records: [
          { tier: 'apex', type: 'MX', name: 'example.com', value: 'inbound.ses.example', purpose: 'MX' },
          { tier: 'sub',  type: 'TXT', name: '_dmarc.example.com', value: 'v=DMARC1; p=none', purpose: 'DMARC' }
        ]
      })
    })
  );

  await page.route('**/onboarding/test-email', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ testId: 't1', to: 'probe+t1@inbound.ses.example' })
    })
  );

  await page.route('**/onboarding/test-email/*/status', (route) => {
    signalReceivedCalls += 1;
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ received: signalReceivedCalls >= 2, signalId: 'sig1' })
    });
  });

  await page.route('**/onboarding/sender', (route) => route.fulfill({ status: 204, body: '' }));
  await page.route('**/onboarding/filter-mode', (route) => route.fulfill({ status: 204, body: '' }));
  await page.route('**/onboarding/complete', (route) => route.fulfill({ status: 204, body: '' }));
}

test.describe('onboarding wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(API, (route) => route.continue());
    await mockOnboardingApi(page);
  });

  test('walks the user through all 5 steps', async ({ page }) => {
    await page.goto('/onboarding');

    await test.step('step 1 — domain', async () => {
      await expect(page.getByRole('heading', { name: /Add your sending domain/ })).toBeVisible();
      await page.getByPlaceholder('example.com').fill('example.com');
      await page.getByRole('button', { name: /Generate DNS records/ }).click();
      await expect(page.getByTestId('dns-records')).toBeVisible();
      await page.getByTestId('next-step').click();
    });

    await test.step('step 2 — test email + signal arrival', async () => {
      await expect(page.getByRole('heading', { name: /Send a test email/ })).toBeVisible();
      await page.getByRole('button', { name: /Send test email/ }).click();
      await expect(page.getByTestId('test-address')).toContainText('probe+t1@inbound.ses.example');
      await expect(page.getByTestId('signal-waiting')).toBeVisible();
      await expect(page.getByTestId('signal-received')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('next-step').click();
    });

    await test.step('step 3 — sender', async () => {
      await expect(page.getByRole('heading', { name: /Set up your sender/ })).toBeVisible();
      await page.getByPlaceholder('hello@example.com').fill('hello@example.com');
      await page.getByPlaceholder('Acme Support').fill('Acme Support');
      await page.getByPlaceholder('Acme Support').blur();
      await page.getByTestId('next-step').click();
    });

    await test.step('step 4 — filter mode', async () => {
      await expect(page.getByRole('heading', { name: /Choose a filter mode/ })).toBeVisible();
      await page.locator('[data-testid="mode-balanced"] input[type="radio"]').check();
      await page.getByTestId('next-step').click();
    });

    await test.step('step 5 — done', async () => {
      await expect(page.getByRole('heading', { name: /You’re ready/ })).toBeVisible();
      await expect(page.getByTestId('recap')).toContainText('example.com');
      await expect(page.getByTestId('recap')).toContainText('Acme Support');
      await expect(page.getByTestId('recap')).toContainText('balanced');
      await page.getByRole('button', { name: /Finish setup/ }).click();
      await expect(page.getByTestId('go-to-inbox')).toBeVisible();
    });
  });
});
