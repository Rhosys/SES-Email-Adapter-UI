import { test, expect, type Page } from '@playwright/test'
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

async function renderEmail(page: Page, rawHtml: string) {
  await page.setContent(wrapEmailHtml(rawHtml))
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
}

test.describe('email body rendering — nested fixed-width container tables', () => {
  test('never overflows the viewport horizontally', async ({ page }) => {
    await renderEmail(page, HOSTILE_EMAIL_HTML)
    expect(await hasHorizontalOverflow(page), 'wrapped email must not force horizontal scroll').toBe(
      false,
    )
  })

  test('probe content stays fully inside the viewport', async ({ page }) => {
    await renderEmail(page, HOSTILE_EMAIL_HTML)
    const box = await page.locator('#probe').boundingBox()
    const viewport = page.viewportSize()!
    expect(box, 'probe element must be present').not.toBeNull()
    expect(box!.x, 'probe must not start off the left edge').toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width, 'probe must not extend past the right edge').toBeLessThanOrEqual(
      viewport.width + 1,
    )
  })

  test('sender-centered container table stays horizontally centered', async ({ page }) => {
    await renderEmail(page, HOSTILE_EMAIL_HTML)
    const box = await page.locator('table.container').boundingBox()
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
    await renderEmail(page, withLongToken)
    expect(
      await hasHorizontalOverflow(page),
      'an unbreakable token must not force the whole page to overflow',
    ).toBe(false)
  })
})
