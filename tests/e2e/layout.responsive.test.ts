import { test, expect, type Page } from '@playwright/test'
import { loginAndGoto } from './helpers/auth'

/** Assert the page has no horizontal scrollbar (layout fits viewport). */
async function expectNoHorizontalOverflow(page: Page) {
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows, 'page must not overflow horizontally').toBe(false)
}

/**
 * The app's mobile/desktop nav split is driven by Tailwind's `sm:` breakpoint
 * (640px CSS width), not by touch capability. Playwright's `isMobile` fixture
 * only reflects the project's device *emulation* (e.g. `narrow` has no device
 * preset, so `isMobile` is false even though its 320px viewport renders the
 * mobile nav). Use this for assertions about what the CSS actually shows.
 */
function isNarrowViewport(page: Page) {
  return (page.viewportSize()?.width ?? 0) < 640
}

// ---------------------------------------------------------------------------
// Responsive layout
// These tests run once per viewport project (pixel, tablet, laptop, desktop).
// No pixel values appear in assertions — we test UX behaviour only.
// ---------------------------------------------------------------------------

test.describe('app shell — responsive layout', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndGoto(page, '/')
  })

  test('no horizontal overflow', async ({ page }) => {
    await expectNoHorizontalOverflow(page)
  })

  test('sidebar is in view on tablet and wider, hidden on mobile', async ({ page }) => {
    const sidebar = page.getByRole('complementary') // <aside> maps to complementary
    if (isNarrowViewport(page)) {
      await expect(sidebar).not.toBeInViewport()
    } else {
      await expect(sidebar).toBeInViewport()
    }
  })

  test('hamburger button is reachable on mobile, absent on wider screens', async ({ page }) => {
    const hamburger = page.getByRole('button', { name: 'Toggle menu' })
    if (isNarrowViewport(page)) {
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
  })
})

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

test.describe('search bar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndGoto(page, '/')
  })

  test('search input is visible and usable', async ({ page }) => {
    test.skip(isNarrowViewport(page), 'inline search bar is hidden below the sm breakpoint — mobile uses a search icon that navigates to /search instead')

    const input = page.getByRole('searchbox')
    await expect(input).toBeVisible()
    await input.fill('test')
    await expect(input).toHaveValue('test')
  })

  test('no overflow after typing in search', async ({ page }) => {
    test.skip(isNarrowViewport(page), 'inline search bar is hidden below the sm breakpoint — mobile uses a search icon that navigates to /search instead')

    await page.getByRole('searchbox').fill('test query')
    await expectNoHorizontalOverflow(page)
  })
})

// ---------------------------------------------------------------------------
// Quarantine page
// ---------------------------------------------------------------------------

test.describe('quarantine page — responsive layout', () => {
  test.beforeEach(async ({ page }) => {
    // Stub the quarantine API so the page renders without a real backend.
    // Registered before loginAndGoto so it's in place for the navigation.
    await page.route('**/signals**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ signals: [], pagination: { cursor: null } }),
      }),
    )
    await loginAndGoto(page, '/quarantine')
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
    // Scoped to the API path (not a bare "**/rules**") — an unscoped glob also
    // matches the page's own navigation to /rules, serving the JSON body as
    // the document instead of the app shell.
    await page.route('**/accounts/*/rules**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rules: [], pagination: { cursor: null } }),
      }),
    )
    await loginAndGoto(page, '/rules')
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
    await page.route('**/accounts/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      }),
    )
    await loginAndGoto(page, '/settings')
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
    await page.route('**/threads**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ threads: [], pagination: { cursor: null } }),
      }),
    )
    await loginAndGoto(page, '/')
  })

  test('no horizontal overflow', async ({ page }) => {
    await expectNoHorizontalOverflow(page)
  })
})
