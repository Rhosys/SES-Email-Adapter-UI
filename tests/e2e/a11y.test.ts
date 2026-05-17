import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Stub account that satisfies the router guard (onboarding completed).
const STUB_ACCOUNT = {
  id: 'acc_test',
  name: 'Test account',
  deletionRetentionDays: 30,
  onboarding: {
    completed: true,
    notificationCoachCompleted: true,
    featureTourCompleted: true,
  },
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

async function stubAuth(page: Page) {
  // Make Authress SDK believe a session exists
  await page.addInitScript(() => {
    Object.defineProperty(window, '__authressSessionStub', { value: true })
  })
  await page.route('**/session/credentials', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
}

async function stubApi(page: Page) {
  // Account list — router guard reads onboarding.completed from here
  await page.route('**/accounts', (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accounts: [STUB_ACCOUNT] }),
    })
  })
  // All other account-scoped endpoints return empty collections
  await page.route('**/accounts/**', (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        arcs: [], signals: [], rules: [], labels: [], views: [],
        templates: [], domains: [], aliases: [], users: [],
        events: [], pagination: { cursor: null },
      }),
    })
  })
}

// Routes to audit — one per distinct view.
// TODO: extend to the full route list once all views are stable:
//   /onboarding, /invite, /billing, /profile, /rules/new, /rules/:id,
//   /arcs/:id, /templates, /audit-log, /terms, /privacy
const ROUTES = [
  '/',
  '/search',
  '/quarantine',
  '/labels',
  '/rules',
  '/settings',
]

// Only run on a single browser project to avoid redundant noise — a11y
// violations are not viewport-dependent.
test.use({ browserName: 'chromium' })

test.describe('Accessibility — WCAG 2.x AA', () => {
  test.beforeEach(async ({ page }) => {
    await stubAuth(page)
    await stubApi(page)
  })

  for (const route of ROUTES) {
    test(`no violations on ${route}`, async ({ page }) => {
      await page.goto(route)
      await page.waitForLoadState('networkidle')

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze()

      expect(
        results.violations,
        results.violations
          .map((v) => `[${v.id}] ${v.description}\n  ${v.nodes.map((n) => n.target).join(', ')}`)
          .join('\n'),
      ).toHaveLength(0)
    })
  }
})
