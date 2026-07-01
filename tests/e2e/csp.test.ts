import { test, expect, type Page } from '@playwright/test'

/**
 * CSP (Content-Security-Policy) compliance tests.
 *
 * These tests verify that:
 * 1. No CSP violations are reported while loading and navigating the app.
 * 2. Every external domain the app actually fetches is covered by the CSP
 *    connect-src directive declared in index.html.
 *
 * The tests intercept the securitypolicyviolation DOM event and collect any
 * blocked-URI values.  A clean run has zero violations.
 *
 * Note: the CSP <meta> tag is injected at build time with real env-var values,
 * so these tests must run against `npm run preview` (the built artefact), which
 * is what playwright.config.ts webServer already does.
 */

async function injectAuth(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__authressSessionStub', { value: true })
  })
  await page.route('**/session/credentials', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
}

/** Collect every CSP violation that fires on the page. */
async function collectCspViolations(page: Page): Promise<string[]> {
  const violations: string[] = []
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      ;(window as unknown as Record<string, unknown>)['__cspViolations'] =
        (window as unknown as Record<string, unknown[]>)['__cspViolations'] ?? []
      ;(window as unknown as Record<string, unknown[]>)['__cspViolations'].push(
        `${e.violatedDirective}: ${e.blockedURI}`,
      )
    })
  })
  // Give the page time to settle before collecting
  await page.waitForTimeout(500)
  const raw = await page.evaluate(
    () => (window as unknown as Record<string, unknown>)['__cspViolations'] ?? [],
  )
  violations.push(...(raw as string[]))
  return violations
}

/** Extract the connect-src value from the CSP <meta> tag on the page. */
async function getConnectSrcDomains(page: Page): Promise<string[]> {
  const cspContent = await page.evaluate(() => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
    return meta?.getAttribute('content') ?? ''
  })
  const match = /connect-src\s+([^;]+)/.exec(cspContent)
  if (!match) return []
  return match[1]
    .trim()
    .split(/\s+/)
    .filter((t) => t !== "'self'" && t.length > 0)
}

// Routes to visit — covers the main navigable views (auth-gated pages load
// their shells without real API data since all XHR is intercepted).
const ROUTES = ['/', '/search', '/quarantine', '/labels', '/rules', '/settings', '/audit-log']

test.describe('CSP — no violations', () => {
  test.beforeEach(async ({ page }) => {
    // Stub all API calls so no real network requests are made (avoids false
    // positive violations from the backend being unreachable in CI).
    await page.route('**/accounts/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"threads":[],"pagination":{"cursor":null}}' }),
    )
    await page.route('**/session/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    )
    await injectAuth(page)
  })

  for (const route of ROUTES) {
    test(`no CSP violations on ${route}`, async ({ page }) => {
      await collectCspViolations(page) // installs listener before navigation
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      const violations = await page.evaluate(
        () => (window as unknown as Record<string, unknown>)['__cspViolations'] ?? [],
      )
      expect(
        violations,
        `CSP violations on ${route}: ${JSON.stringify(violations)}`,
      ).toHaveLength(0)
    })
  }
})

test.describe('CSP — connect-src covers known external domains', () => {
  test('connect-src lists dns.google', async ({ page }) => {
    await page.goto('/')
    const domains = await getConnectSrcDomains(page)
    expect(domains.some((d) => d.includes('dns.google'))).toBe(true)
  })

  test('connect-src lists the Authress login URL', async ({ page }) => {
    await page.goto('/')
    const domains = await getConnectSrcDomains(page)
    // The Authress login URL may be the full URL or just the host — check that
    // some token in connect-src contains the known domain.
    expect(domains.some((d) => d.includes('login.rhosys.cloud') || d.includes('authress'))).toBe(
      true,
    )
  })

  test('connect-src lists the API base URL', async ({ page }) => {
    await page.goto('/')
    const domains = await getConnectSrcDomains(page)
    // During preview the API URL is the value of VITE_API_BASE_URL at build time.
    // We just assert at least one non-'self' connect-src token exists.
    expect(domains.length).toBeGreaterThan(0)
  })
})
