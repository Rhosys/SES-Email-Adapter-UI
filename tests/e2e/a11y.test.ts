import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { stubAccounts, gotoAuthed } from './helpers/auth'

// Account-scoped endpoints return empty collections so each page renders its
// empty state (rather than hanging on a real backend) for the audit.
async function stubApi(page: Page) {
  await page.route('**/accounts/**', (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threads: [], signals: [], rules: [], labels: [], views: [],
        templates: [], domains: [], aliases: [], users: [],
        events: [], pagination: { cursor: null },
      }),
    })
  })
}

// Routes to audit — one per distinct view.
// TODO: extend to the full route list once all views are stable:
//   /onboarding, /invite, /billing, /profile, /rules/new, /rules/:id,
//   /threads/:id, /templates, /audit-log, /terms, /privacy
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
    await stubAccounts(page)
    await stubApi(page)
  })

  for (const route of ROUTES) {
    test(`no violations on ${route}`, async ({ page }) => {
      await gotoAuthed(page, route)
      // Wait for the content region (not networkidle — the authenticated app
      // holds a realtime connection open, so the network never goes idle).
      await page.locator('#main-content').waitFor({ state: 'visible' })

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
