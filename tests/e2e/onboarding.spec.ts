import { test, expect, type Page } from '@playwright/test';

const ACCOUNT_ID = 'test-account';

async function mockServer(page: Page) {
  let recordsCalls = 0;
  let arcsCalls = 0;
  const domainId = 'd1';

  await page.route(`**/accounts/${ACCOUNT_ID}/domains`, (route) => {
    if (route.request().method() === 'POST') {
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: domainId,
          accountId: ACCOUNT_ID,
          domain: 'example.com',
          receivingSetupComplete: false,
          senderSetupComplete: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
  });

  await page.route(`**/accounts/${ACCOUNT_ID}/domains/${domainId}/records`, (route) => {
    recordsCalls += 1;
    // After the second call the MX flips to verified — simulates DNS propagation.
    const mxStatus = recordsCalls >= 2 ? 'verified' : 'pending';
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { name: 'example.com',                  type: 'MX',    value: '10 inbound-smtp.eu-west-1.amazonaws.com', status: mxStatus },
        { name: 'mail._domainkey.example.com',  type: 'CNAME', value: 'mail.mail.example._domainkey.amazonses.com', status: 'pending' },
        { name: 'bounce.example.com',           type: 'TXT',   value: 'v=spf1 include:amazonses.com ~all', status: 'pending' },
        { name: '_dmarc.example.com',           type: 'CNAME', value: '_dmarc.mail.example', status: 'pending' }
      ])
    });
  });

  await page.route(`**/accounts/${ACCOUNT_ID}/arcs?**`, (route) => {
    arcsCalls += 1;
    // First call: empty list. Second call: the test arc has appeared.
    const items = arcsCalls >= 2
      ? [{
          id: 'arc1', accountId: ACCOUNT_ID, workflow: 'test',
          labels: [], status: 'active',
          summary: 'Hello from your inbox — setup works!',
          lastSignalAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }]
      : [];
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items, total: items.length })
    });
  });

  await page.route(`**/accounts/${ACCOUNT_ID}`, (route) => {
    if (route.request().method() === 'PATCH') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    } else {
      route.continue();
    }
  });
}

test.describe('onboarding wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((id) => {
      localStorage.setItem('ses-ui.account-id', id);
    }, ACCOUNT_ID);
    await mockServer(page);
  });

  test('walks the user through all 5 steps using real /accounts/:accountId/... routes', async ({ page }) => {
    await page.goto('/onboarding');

    await test.step('step 1 — register domain', async () => {
      await expect(page.getByRole('heading', { name: /Register your domain/ })).toBeVisible();
      await page.getByPlaceholder('example.com').fill('example.com');
      await page.getByRole('button', { name: /Generate DNS records/ }).click();
      await expect(page.getByTestId('dns-records')).toBeVisible();
      // Auto-advance fires once MX flips to verified on the second poll.
      await expect(page.getByRole('heading', { name: /Send yourself an email/ })).toBeVisible({ timeout: 30_000 });
    });

    await test.step('step 2 — wait for the test signal', async () => {
      await expect(page.getByTestId('test-address')).toContainText('@example.com');
      await expect(page.getByTestId('signal-waiting')).toBeVisible();
      await expect(page.getByTestId('signal-received')).toBeVisible({ timeout: 15_000 });
      await page.getByTestId('next-step').click();
    });

    await test.step('step 3 — sender DNS', async () => {
      await expect(page.getByRole('heading', { name: /Set up sending/ })).toBeVisible();
      await page.getByTestId('next-step').click();
    });

    await test.step('step 4 — filter mode', async () => {
      await expect(page.getByRole('heading', { name: /Choose your filter mode/ })).toBeVisible();
      await page.locator('[data-testid="mode-strict"] input[type="radio"]').check();
      await page.getByTestId('next-step').click();
    });

    await test.step('step 5 — done', async () => {
      await expect(page.getByRole('heading', { name: /You.+re ready/ })).toBeVisible();
      await expect(page.getByTestId('recap')).toContainText('example.com');
      await expect(page.getByTestId('recap')).toContainText('strict');
      await expect(page.getByTestId('go-to-inbox')).toBeVisible();
    });
  });
});
