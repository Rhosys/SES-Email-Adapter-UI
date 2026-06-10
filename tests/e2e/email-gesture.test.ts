import { test, expect, type Page, type CDPSession } from '@playwright/test'

// ---------------------------------------------------------------------------
// Stub data
// ---------------------------------------------------------------------------

const ACCOUNT_ID = 'test-account-id'
const ARC_ID = 'test-arc-id'

const STUB_ACCOUNT = {
  accountId: ACCOUNT_ID,
  name: 'Test Account',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

const STUB_ARC = {
  arcId: ARC_ID,
  workflow: 'conversation',
  labels: [],
  status: 'active',
  summary: 'Test email thread',
  lastSignalAt: '2024-01-01T12:00:00Z',
  createdAt: '2024-01-01T12:00:00Z',
  updatedAt: '2024-01-01T12:00:00Z',
}

/** Email body with an inline image to exercise the zoom feature. */
const EMAIL_BODY_WITH_IMAGE = [
  '<!DOCTYPE html><html><body style="margin:0;padding:16px">',
  '<p>Hello, this is a test email.</p>',
  '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'',
  ' width=\'200\' height=\'200\'%3E%3Crect width=\'200\' height=\'200\'',
  ' fill=\'%234e9af1\'/%3E%3C/svg%3E"',
  ' alt="Test image" style="width:200px;height:200px;display:block"/>',
  '<p>Footer text.</p>',
  '</body></html>',
].join('')

const STUB_SIGNAL = {
  signalId: 'test-signal-id',
  arcId: ARC_ID,
  type: 'email',
  source: 'external',
  status: 'received',
  createdAt: '2024-01-01T12:00:00Z',
  data: {
    receivedAt: '2024-01-01T12:00:00Z',
    summary: 'Test email',
    from: { address: 'sender@example.com', name: 'Sender' },
    to: [{ address: 'recipient@example.com' }],
    cc: [],
    subject: 'Test email with image',
    body: EMAIL_BODY_WITH_IMAGE,
    attachments: [],
    headers: {},
    recipientAddress: 'recipient@example.com',
    workflow: 'conversation',
    spamScore: 0,
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function injectAuth(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__authressSessionStub', { value: true })
  })
  await page.route('**/session/credentials', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
}

async function stubEmailArc(page: Page) {
  await page.route('**/accounts', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accounts: [STUB_ACCOUNT] }),
    }),
  )
  await page.route(`**/accounts/${ACCOUNT_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STUB_ACCOUNT),
    }),
  )
  await page.route(`**/accounts/${ACCOUNT_ID}/arcs/${ARC_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STUB_ARC),
    }),
  )
  await page.route(`**/accounts/${ACCOUNT_ID}/arcs/${ARC_ID}/signals**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        arc: STUB_ARC,
        signals: [STUB_SIGNAL],
        pagination: { cursor: null },
      }),
    }),
  )
}

/**
 * Simulate a two-finger pinch via CDP touch events.
 * The gesture is centred on (cx, cy); `startDist`→`endDist` is the
 * finger-separation in pixels.  Spread = zoom in, squeeze = zoom out.
 */
async function simulatePinch(
  cdp: CDPSession,
  cx: number,
  cy: number,
  startDist: number,
  endDist: number,
) {
  const pt = (id: number, x: number, y: number) => ({
    x,
    y,
    radiusX: 1,
    radiusY: 1,
    rotationAngle: 0,
    force: 0.5,
    id,
  })

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [pt(1, cx - startDist / 2, cy), pt(2, cx + startDist / 2, cy)],
  })

  const STEPS = 6
  for (let i = 1; i <= STEPS; i++) {
    const d = startDist + ((endDist - startDist) * i) / STEPS
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [pt(1, cx - d / 2, cy), pt(2, cx + d / 2, cy)],
    })
  }

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/**
 * Simulate a directional swipe via CDP: starts at (cx, cy) and moves
 * (dx, dy) pixels across several steps.
 */
async function simulateSwipe(
  cdp: CDPSession,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
) {
  const pt = (x: number, y: number) => ({
    x,
    y,
    radiusX: 1,
    radiusY: 1,
    rotationAngle: 0,
    force: 0.5,
    id: 1,
  })

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [pt(cx, cy)],
  })

  const STEPS = 5
  for (let i = 1; i <= STEPS; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [pt(cx + (dx * i) / STEPS, cy + (dy * i) / STEPS)],
    })
  }

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/**
 * Simulate a double-tap using synthetic TouchEvents dispatched via
 * page.evaluate so we fully control the 100 ms inter-tap delay.
 * The overlay must have pointer-events:auto (it always does at scale=1).
 */
async function simulateDoubleTap(page: Page, cx: number, cy: number) {
  await page.evaluate(({ cx, cy }) => {
    function fireTap(x: number, y: number) {
      const target = document.elementFromPoint(x, y)
      if (!target) return
      const touch = (type: string) =>
        target.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches:
              type === 'touchend' ? [] : [new Touch({ identifier: 1, target, clientX: x, clientY: y })],
            changedTouches: [new Touch({ identifier: 1, target, clientX: x, clientY: y })],
          }),
        )
      touch('touchstart')
      touch('touchend')
    }
    fireTap(cx, cy)
    setTimeout(() => fireTap(cx, cy), 80) // 80 ms — inside the 350 ms double-tap window
  }, { cx, cy })
  // Allow both taps and the composable's state update to settle
  await page.waitForTimeout(250)
}

/** Read the scaleX component of the iframe's CSS transform matrix. */
async function getIframeScale(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('iframe[title="Email content"]') as HTMLElement | null
    if (!el) return 1
    return new DOMMatrixReadOnly(getComputedStyle(el).transform).m11
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('email card — touch gestures', () => {
  // CDP touch injection is Chromium-only; limits to chromium-based projects
  test.use({ browserName: 'chromium' })

  test.beforeEach(async ({ page }) => {
    await injectAuth(page)
    await stubEmailArc(page)
    await page.goto(`/arcs/${ARC_ID}`)
    await expect(page.locator('[data-testid="email-body-container"]')).toBeVisible()
  })

  // ── Structural ─────────────────────────────────────────────────────────────

  test('email body iframe renders', async ({ page }) => {
    await expect(page.locator('iframe[title="Email content"]')).toBeVisible()
  })

  test('gesture overlay covers the iframe area', async ({ page }) => {
    const container = page.locator('[data-testid="email-body-container"]')
    const overlay = container.locator('div[aria-hidden="true"]')
    await expect(overlay).toBeAttached()

    const iframeBox = await page.locator('iframe[title="Email content"]').boundingBox()
    const overlayBox = await overlay.boundingBox()
    expect(overlayBox).not.toBeNull()
    // Overlay must sit at the same position/size as the iframe (tolerance: 2 px)
    expect(Math.abs(overlayBox!.x - iframeBox!.x)).toBeLessThan(2)
    expect(Math.abs(overlayBox!.y - iframeBox!.y)).toBeLessThan(2)
    expect(Math.abs(overlayBox!.width - iframeBox!.width)).toBeLessThan(2)
  })

  test('zoom controls are hidden at natural scale', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Reset zoom to 100%' })).not.toBeVisible()
    await expect(page.getByLabel('Current zoom level')).not.toBeVisible()
  })

  test('no horizontal overflow with email card', async ({ page }) => {
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows, 'page must not overflow horizontally').toBe(false)
  })

  // ── touch-action ───────────────────────────────────────────────────────────

  test('overlay touch-action is pan-y at natural scale', async ({ page }) => {
    const overlay = page
      .locator('[data-testid="email-body-container"]')
      .locator('div[aria-hidden="true"]')
    const ta = await overlay.evaluate((el) => (el as HTMLElement).style.touchAction)
    expect(ta).toBe('pan-y')
  })

  test('overlay touch-action becomes none when zoomed', async ({ page }) => {
    const box = await page.locator('[data-testid="email-body-container"]').boundingBox()
    const cdp = await page.context().newCDPSession(page)
    await simulatePinch(cdp, box!.x + box!.width / 2, box!.y + box!.height / 2, 40, 160)

    const overlay = page
      .locator('[data-testid="email-body-container"]')
      .locator('div[aria-hidden="true"]')
    const ta = await overlay.evaluate((el) => (el as HTMLElement).style.touchAction)
    expect(ta).toBe('none')
  })

  // ── Pinch-to-zoom ──────────────────────────────────────────────────────────

  test('pinch-open scales the iframe above 1×', async ({ page }) => {
    const box = await page.locator('[data-testid="email-body-container"]').boundingBox()
    const cx = box!.x + box!.width / 2
    const cy = box!.y + box!.height / 2

    const cdp = await page.context().newCDPSession(page)
    // Spread from 40 px to 160 px → distance ratio 4× → scale capped at MAX_SCALE
    await simulatePinch(cdp, cx, cy, 40, 160)

    expect(await getIframeScale(page)).toBeGreaterThan(1.5)
  })

  test('zoom badge appears and shows scale after pinch', async ({ page }) => {
    const box = await page.locator('[data-testid="email-body-container"]').boundingBox()
    const cx = box!.x + box!.width / 2
    const cy = box!.y + box!.height / 2

    const cdp = await page.context().newCDPSession(page)
    await simulatePinch(cdp, cx, cy, 40, 160)

    const badge = page.getByLabel('Current zoom level')
    await expect(badge).toBeVisible()
    await expect(badge).toContainText('×')
  })

  test('pinch-close back toward 1× reduces scale', async ({ page }) => {
    const box = await page.locator('[data-testid="email-body-container"]').boundingBox()
    const cx = box!.x + box!.width / 2
    const cy = box!.y + box!.height / 2

    const cdp = await page.context().newCDPSession(page)
    await simulatePinch(cdp, cx, cy, 40, 160)
    const zoomedScale = await getIframeScale(page)

    await simulatePinch(cdp, cx, cy, 160, 60)
    const reducedScale = await getIframeScale(page)

    expect(reducedScale).toBeLessThan(zoomedScale)
  })

  // ── Reset button ───────────────────────────────────────────────────────────

  test('Reset button appears when zoomed and restores 1× on click', async ({ page }) => {
    const box = await page.locator('[data-testid="email-body-container"]').boundingBox()
    const cdp = await page.context().newCDPSession(page)
    await simulatePinch(cdp, box!.x + box!.width / 2, box!.y + box!.height / 2, 40, 160)

    const resetBtn = page.getByRole('button', { name: 'Reset zoom to 100%' })
    await expect(resetBtn).toBeVisible()
    await resetBtn.click()

    // Controls hidden after reset
    await expect(resetBtn).not.toBeVisible()
    expect(await getIframeScale(page)).toBeCloseTo(1, 1)
  })

  // ── Double-tap ─────────────────────────────────────────────────────────────

  test('double-tap zooms email to ~2.5×', async ({ page }) => {
    const box = await page.locator('[data-testid="email-body-container"]').boundingBox()
    const cx = box!.x + box!.width / 2
    const cy = box!.y + box!.height / 2

    await simulateDoubleTap(page, cx, cy)

    expect(await getIframeScale(page)).toBeGreaterThan(2)
    await expect(page.getByLabel('Current zoom level')).toBeVisible()
  })

  test('double-tap when already zoomed resets to 1×', async ({ page }) => {
    const box = await page.locator('[data-testid="email-body-container"]').boundingBox()
    const cx = box!.x + box!.width / 2
    const cy = box!.y + box!.height / 2

    // Zoom in
    await simulateDoubleTap(page, cx, cy)
    expect(await getIframeScale(page)).toBeGreaterThan(2)

    // Reset via second double-tap
    await simulateDoubleTap(page, cx, cy)
    expect(await getIframeScale(page)).toBeCloseTo(1, 1)
    await expect(page.getByRole('button', { name: 'Reset zoom to 100%' })).not.toBeVisible()
  })

  // ── Swipe-down collapses card ──────────────────────────────────────────────

  test('fast downward swipe collapses the email card', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'swipe-to-collapse is a touch UX pattern')

    const box = await page.locator('[data-testid="email-body-container"]').boundingBox()
    const cx = box!.x + box!.width / 2
    const cy = box!.y + box!.height / 4

    const cdp = await page.context().newCDPSession(page)
    // Fast swipe: 80 px downward — exceeds the 50 px threshold at < 300 ms
    await simulateSwipe(cdp, cx, cy, 0, 80)

    await expect(page.locator('iframe[title="Email content"]')).not.toBeVisible({ timeout: 1000 })
  })

  test('collapse then re-expand resets zoom to 1×', async ({ page }) => {
    const box = await page.locator('[data-testid="email-body-container"]').boundingBox()
    const cdp = await page.context().newCDPSession(page)
    await simulatePinch(cdp, box!.x + box!.width / 2, box!.y + box!.height / 2, 40, 160)
    expect(await getIframeScale(page)).toBeGreaterThan(1.5)

    // The card header button toggles expand/collapse (aria-expanded on the
    // button that wraps the from-label and timestamp)
    const toggleBtn = page.locator('button[aria-expanded]').first()
    await toggleBtn.click() // collapse
    await expect(page.locator('iframe[title="Email content"]')).not.toBeVisible()

    await toggleBtn.click() // re-expand
    await expect(page.locator('iframe[title="Email content"]')).toBeVisible()

    // Zoom should have been reset by the watch(expanded) in the component
    expect(await getIframeScale(page)).toBeCloseTo(1, 1)
  })
})
