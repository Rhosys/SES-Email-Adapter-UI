import { test, expect, type Page } from '@playwright/test'

/**
 * Auth setup — inject a fake Authress session so the router guard passes.
 * Replace the storageState path once a real auth fixture is set up:
 *   test.use({ storageState: 'tests/e2e/.auth/session.json' })
 *
 * In the interim we patch userSessionExists via addInitScript so every
 * test starts on an authenticated page.
 */
async function injectAuth(page: Page) {
  await page.addInitScript(() => {
    // Stub the Authress LoginClient to report an active session
    Object.defineProperty(window, '__authressSessionStub', { value: true })
  })
  // Route the session-check endpoint so it returns 200 with a minimal token
  await page.route('**/session/credentials', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
}

/** Assert the page has no horizontal scrollbar (layout fits viewport). */
async function expectNoHorizontalOverflow(page: Page) {
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows, 'page must not overflow horizontally').toBe(false)
}

// ---------------------------------------------------------------------------
// Responsive layout
// These tests run once per viewport project (pixel, tablet, laptop, desktop).
// No pixel values appear in assertions — we test UX behaviour only.
// ---------------------------------------------------------------------------

test.describe('app shell — responsive layout', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await page.goto('/')
  })

  test('no horizontal overflow', async ({ page }) => {
    await expectNoHorizontalOverflow(page)
  })

  test('sidebar is in view on tablet and wider, hidden on mobile', async ({ page, isMobile }) => {
    // isMobile is true only for the pixel project (devices['Pixel 7'])
    const sidebar = page.getByRole('complementary') // <aside> maps to complementary
    if (isMobile) {
      await expect(sidebar).not.toBeInViewport()
    } else {
      await expect(sidebar).toBeInViewport()
    }
  })

  test('hamburger button is reachable on mobile, absent on wider screens', async ({
    page,
    isMobile,
  }) => {
    const hamburger = page.getByRole('button', { name: 'Toggle menu' })
    if (isMobile) {
      await expect(hamburger).toBeVisible()
    } else {
      await expect(hamburger).not.toBeVisible()
    }
  })

  test('tapping hamburger slides sidebar into view on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sidebar toggle is mobile-only')

    const hamburger = page.getByRole('button', { name: 'Toggle menu' })
    await hamburger.tap()

    const sidebar = page.getByRole('complementary')
    await expect(sidebar).toBeInViewport()
  })

  test('sidebar closes after navigation on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sidebar toggle is mobile-only')

    await page.getByRole('button', { name: 'Toggle menu' }).tap()
    await page.getByRole('link', { name: 'Quarantine' }).tap()

    const sidebar = page.getByRole('complementary')
    await expect(sidebar).not.toBeInViewport()
  })

  test('all primary nav links are reachable', async ({ page, isMobile }) => {
    if (isMobile) {
      // Open sidebar first on mobile
      await page.getByRole('button', { name: 'Toggle menu' }).tap()
    }
    const sidebar = page.getByRole('complementary')
    await expect(sidebar.getByRole('link', { name: 'Inbox' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Quarantine' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Search' })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

test.describe('search bar', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await page.goto('/')
  })

  test('search input is visible and usable', async ({ page }) => {
    const input = page.getByRole('searchbox')
    await expect(input).toBeVisible()
    await input.fill('test')
    await expect(input).toHaveValue('test')
  })

  test('no overflow after typing in search', async ({ page }) => {
    await page.getByRole('searchbox').fill('test query')
    await expectNoHorizontalOverflow(page)
  })
})

// ---------------------------------------------------------------------------
// Quarantine page
// ---------------------------------------------------------------------------

test.describe('quarantine page — responsive layout', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    // Stub the quarantine API so the page renders without a real backend
    await page.route('**/signals**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ signals: [], pagination: { cursor: null } }),
      }),
    )
    await page.goto('/quarantine')
  })

  test('no horizontal overflow', async ({ page }) => {
    await expectNoHorizontalOverflow(page)
  })

  test('sender filter input fits viewport', async ({ page }) => {
    const input = page.getByPlaceholder('sender@example.com')
    await expect(input).toBeVisible()
    const box = await input.boundingBox()
    const viewport = page.viewportSize()!
    expect(box!.x + box!.width, 'sender input must not extend beyond viewport').toBeLessThanOrEqual(
      viewport.width,
    )
  })

  test('date filter inputs are visible', async ({ page }) => {
    const inputs = page.locator('input[type="date"]')
    await expect(inputs.first()).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Rules page
// ---------------------------------------------------------------------------

test.describe('rules page — responsive layout', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await page.route('**/rules**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rules: [], pagination: { cursor: null } }),
      }),
    )
    await page.goto('/rules')
  })

  test('no horizontal overflow', async ({ page }) => {
    await expectNoHorizontalOverflow(page)
  })
})

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

test.describe('settings page — responsive layout', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await page.route('**/accounts/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      }),
    )
    await page.goto('/settings')
  })

  test('no horizontal overflow', async ({ page }) => {
    await expectNoHorizontalOverflow(page)
  })
})

// ---------------------------------------------------------------------------
// Inbox page
// ---------------------------------------------------------------------------

test.describe('inbox page — responsive layout', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await page.route('**/arcs**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ arcs: [], pagination: { cursor: null } }),
      }),
    )
    await page.goto('/')
  })

  test('no horizontal overflow', async ({ page }) => {
    await expectNoHorizontalOverflow(page)
  })
})
