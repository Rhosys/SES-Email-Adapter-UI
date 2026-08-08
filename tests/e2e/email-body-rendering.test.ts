import { test, expect, type Page, type Frame } from '@playwright/test'
import { wrapEmailHtml } from '../../src/lib/emailHtml'

// Regression coverage for the mobile-overflow / desktop-centering tension in
// wrapEmailHtml (src/lib/emailHtml.ts). The email iframe is the most-visited
// surface in the app and has broken twice from the same root cause: HTML
// emails nest "container" tables with explicit pixel widths (e.g. width:
// 640px) inside a <center> wrapper, which is the standard pattern generated
// by every major email-builder tool (Mailchimp, Foundation for Emails,
// Infomaniak, etc.). tests/unit/emailHtml.test.ts only asserts on the
// generated CSS *string* — it can't catch a real browser layout regression,
// which is exactly how this shipped twice. These tests render the actual
// wrapped output in a real browser across the project's full viewport matrix
// (narrow/mobile/pixel = mobile widths, tablet/laptop/desktop = wide) so both
// failure modes are covered on every run:
//   - width: auto (old fix) removed overflow but broke centering on wide
//     screens (CSS resolves `margin: auto` to 0 when `width` is also auto).
//   - max-width: 100% alone (previous fix) restored centering but a deeply
//     nested table's explicit pixel width still drags every ancestor table
//     up to that width (browsers size an auto-layout table to fit its widest
//     un-shrinkable descendant), overflowing narrow viewports.
//
// The fixture is rendered through an actual sandboxed <iframe srcdoc> — the
// same structure EmailSignalCard.vue uses — rather than loading the wrapped
// HTML as the top-level document. That's not just fidelity for its own sake:
// a <meta name="viewport"> tag (which wrapEmailHtml injects) has no effect
// inside an iframe in any browser, so testing through the iframe exercises
// exactly what production relies on (the CSS overrides alone) instead of a
// mechanism that never applies in production and is, separately, unreliable
// under Playwright/WebKit when the top-level document is loaded via
// setContent() rather than a real navigation.

/** Mirrors the real-world nested "container" table pattern that broke this twice. */
const HOSTILE_EMAIL_HTML = `
<table class="body" style="width:100%">
  <tbody><tr><td align="center">
    <center style="min-width:640px;width:100%">
      <table align="center" class="container" style="width:640px;margin:0 auto">
        <tbody><tr><td style="padding:20px">
          <table style="width:100%">
            <tbody><tr><td id="probe" style="font-size:20px;padding:16px;background:#f4f6fd">
              Confirm your email address
            </td></tr></tbody>
          </table>
        </td></tr></tbody>
      </table>
    </center>
  </td></tr></tbody>
</table>
`

function escapeForAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/** Same sandbox + full-width iframe pattern as EmailSignalCard.vue's email body iframe. */
function hostPage(rawHtml: string): string {
  const srcdoc = escapeForAttribute(wrapEmailHtml(rawHtml))
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0">
<iframe title="Email content" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" style="width:100%;height:1200px;border:0;display:block" srcdoc="${srcdoc}"></iframe>
</body></html>`
}

/** Navigates via a real data: URL (not setContent) and returns the iframe's content frame. */
async function renderEmail(page: Page, rawHtml: string): Promise<Frame> {
  await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(hostPage(rawHtml)))
  const handle = await page.locator('iframe[title="Email content"]').elementHandle()
  const frame = await handle!.contentFrame()
  expect(frame, 'email iframe must produce a content frame').not.toBeNull()
  await frame!.waitForLoadState('domcontentloaded')
  return frame!
}

async function hasHorizontalOverflow(frame: Frame): Promise<boolean> {
  return frame.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
}

test.describe('email body rendering — nested fixed-width container tables', () => {
  test('never overflows the iframe horizontally', async ({ page }) => {
    const frame = await renderEmail(page, HOSTILE_EMAIL_HTML)
    expect(await hasHorizontalOverflow(frame), 'wrapped email must not force horizontal scroll').toBe(
      false,
    )
  })

  test('probe content stays fully inside the viewport', async ({ page }) => {
    const frame = await renderEmail(page, HOSTILE_EMAIL_HTML)
    const box = await frame.locator('#probe').boundingBox()
    const viewport = page.viewportSize()!
    expect(box, 'probe element must be present').not.toBeNull()
    expect(box!.x, 'probe must not start off the left edge').toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width, 'probe must not extend past the right edge').toBeLessThanOrEqual(
      viewport.width + 1,
    )
  })

  test('sender-centered container table stays horizontally centered', async ({ page }) => {
    const frame = await renderEmail(page, HOSTILE_EMAIL_HTML)
    const box = await frame.locator('table.container').boundingBox()
    const viewport = page.viewportSize()!
    const boxCenter = box!.x + box!.width / 2
    const viewportCenter = viewport.width / 2
    // Generous tolerance: this only needs to catch "collapsed to the left
    // edge" (the width:auto regression), not assert pixel-perfect centering.
    expect(
      Math.abs(boxCenter - viewportCenter),
      'container table must be centered, not left-aligned',
    ).toBeLessThan(viewport.width * 0.1 + 5)
  })

  test('a table with an unbreakable long word scrolls internally instead of blowing out the page', async ({
    page,
  }) => {
    const withLongToken = HOSTILE_EMAIL_HTML.replace(
      'Confirm your email address',
      'https://example.com/verify?token=' + 'a'.repeat(120),
    )
    const frame = await renderEmail(page, withLongToken)
    expect(
      await hasHorizontalOverflow(frame),
      'an unbreakable token must not force the whole page to overflow',
    ).toBe(false)
  })
})
