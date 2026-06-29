import { test, expect, type Page } from '@playwright/test'

/**
 * PWA installability validation — confirms the app is installable as a standalone
 * PWA (e.g. on Android) without needing a physical device. The assertions mirror
 * Chrome's documented install criteria:
 *   - a linked, valid web manifest (name/short_name, standalone display, start_url)
 *   - 192px and 512px PNG icons plus a maskable icon, all fetchable
 *   - a registered, active service worker (which precaches the app shell)
 *   - the app shell still loads with the network forced offline
 *
 * These run against `npm run preview` (the built dist/), which is the only place
 * the service worker is active — `devOptions.enabled` is false in dev.
 *
 * Service-worker and CDP manifest APIs are Chromium-only, so this spec is pinned
 * to Chromium (it also runs under its own `pwa` Playwright project — see
 * playwright.config.ts).
 */
test.use({ browserName: 'chromium' })

/** Stub Authress + account APIs so loading `/` doesn't redirect to external login. */
async function injectAuth(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__authressSessionStub', { value: true })
  })
  await page.route('**/session/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.route('**/accounts/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"accounts":[]}' }),
  )
}

test.describe('PWA installability', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
  })

  test('manifest is linked, valid, and has installable icons', async ({ page, request, baseURL }) => {
    await page.goto('/')

    const href = await page.getAttribute('link[rel="manifest"]', 'href')
    expect(href, 'index.html must link a web manifest').toBeTruthy()

    const manifestUrl = new URL(href!, baseURL!).toString()
    const res = await request.get(manifestUrl)
    expect(res.ok(), 'manifest must be fetchable').toBe(true)

    const manifest = await res.json()
    expect(manifest.name, 'manifest.name').toBeTruthy()
    expect(manifest.short_name, 'manifest.short_name').toBeTruthy()
    expect(manifest.display, 'manifest.display').toBe('standalone')
    expect(manifest.start_url, 'manifest.start_url').toBeTruthy()

    const icons: Array<{ src: string; sizes?: string; type?: string; purpose?: string }> =
      manifest.icons ?? []
    const hasSize = (size: string) =>
      icons.some((i) => i.sizes?.split(/\s+/).includes(size) && i.type === 'image/png')
    expect(hasSize('192x192'), 'a 192x192 PNG icon is required for Android install').toBe(true)
    expect(hasSize('512x512'), 'a 512x512 PNG icon is required for Android install').toBe(true)
    expect(
      icons.some((i) => (i.purpose ?? '').split(/\s+/).includes('maskable')),
      'a maskable icon is required to render correctly inside the adaptive icon mask',
    ).toBe(true)

    // Every declared icon must actually resolve.
    for (const icon of icons) {
      const iconUrl = new URL(icon.src, manifestUrl).toString()
      const iconRes = await request.get(iconUrl)
      expect(iconRes.ok(), `icon ${icon.src} must return 200`).toBe(true)
      expect(iconRes.headers()['content-type'], `icon ${icon.src} content-type`).toContain('image/')
    }
  })

  test('service worker registers and activates', async ({ page, context }) => {
    // Detect the SW at the BrowserContext level — immune to the SPA's
    // client-side redirects, which otherwise race in-page `page.evaluate` calls.
    // Arm the wait before navigating so we can't miss the registration event.
    const swPromise = context.waitForEvent('serviceworker', { timeout: 20_000 })
    await page.goto('/')
    const sw = await swPromise
    expect(sw.url(), 'a service worker must be registered for the app').toMatch(/\/sw\.js$/)
  })

  test('manifest has no critical errors (Chrome installability check)', async ({ page }) => {
    await page.goto('/')
    const cdp = await page.context().newCDPSession(page)
    const { errors } = await cdp.send('Page.getAppManifest')
    // `critical` is a number (0 = warning, non-zero = blocking installability).
    const critical = errors.filter((e) => e.critical)
    expect(critical, `critical manifest errors: ${JSON.stringify(critical)}`).toEqual([])
  })

  test('app shell is precached for offline use', async ({ page, context }) => {
    const swPromise = context.waitForEvent('serviceworker', { timeout: 20_000 })
    await page.goto('/')
    const sw = await swPromise

    // Wait for the SW to finish installing (precache populated) and activate.
    // Polled in the SW's own context, so it's unaffected by SPA navigations.
    await expect
      .poll(
        () =>
          sw.evaluate(() => {
            const reg = (self as unknown as { registration?: { active?: { state?: string } } })
              .registration
            return reg?.active?.state ?? null
          }),
        { timeout: 20_000, message: 'service worker should reach the activated state' },
      )
      .toBe('activated')

    // The Workbox precache must contain the app shell (index.html) so the SW's
    // navigateFallback can serve it offline. Inspected directly in the SW's Cache
    // Storage — deterministic, with no network toggling or navigation races (a
    // live offline reload proved too flaky across browsers/CI timing).
    const precachedShell = await sw.evaluate(async () => {
      for (const name of await caches.keys()) {
        const requests = await (await caches.open(name)).keys()
        if (requests.some((r) => r.url.includes('index.html'))) return true
      }
      return false
    })
    expect(precachedShell, 'index.html must be precached for offline use').toBe(true)
  })
})
