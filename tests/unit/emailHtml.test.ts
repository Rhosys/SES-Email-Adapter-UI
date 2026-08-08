import { describe, it, expect } from 'vitest'
import { wrapEmailHtml } from '@/lib/emailHtml'

describe('wrapEmailHtml — table overflow prevention', () => {
  it('shrinks tables to their content instead of a fixed pixel width', () => {
    const wide = '<table style="width:1200px"><tr><td>Wide content</td></tr></table>'
    const result = wrapEmailHtml(wide)

    // A table kept at its specified pixel width (even under max-width: 100%)
    // can still force nested "container" tables several levels up to
    // overflow the viewport — width: auto is what actually contains it.
    expect(result).toMatch(/table\s*\{[^}]*width:\s*auto/)
  })

  it('constrains wide tables via max-width so they cannot overflow the iframe', () => {
    const wide = '<table style="width:1200px"><tr><td>Wide content</td></tr></table>'
    const result = wrapEmailHtml(wide)

    // The injected CSS must include max-width: 100% on tables to prevent overflow.
    expect(result).toMatch(/table\s*\{[^}]*max-width:\s*100%/)
  })

  it('centers shrunk container tables with flexbox, not margin: auto', () => {
    const centered = '<table style="width:640px;margin:0 auto"><tr><td>Content</td></tr></table>'
    const result = wrapEmailHtml(centered)

    // Centering a table via its own margin: 0 auto only works when the
    // table's width is definite — CSS resolves auto margins to 0 (not
    // centered) once width is also auto, which is what width: auto above
    // does to every table. Flexbox alignment on the body doesn't have that
    // dependency, so that's what has to carry the centering instead.
    expect(result).toMatch(/body\s*\{[^}]*display:\s*flex/)
    expect(result).toMatch(/body\s*>\s*table[^{]*\{[^}]*align-self:\s*center/)
  })

  it('resets min-width so a <center style="min-width:..."> wrapper cannot force overflow', () => {
    const wrapper = '<center style="min-width:640px;width:100%">Content</center>'
    const result = wrapEmailHtml(wrapper)

    // min-width wins over max-width when the two conflict, so the universal
    // max-width: 100% reset alone doesn't neutralize a wrapper like this —
    // common in Foundation-for-Emails-style templates — on narrow viewports.
    expect(result).toMatch(/\*\s*\{[^}]*min-width:\s*0/)
  })
})
