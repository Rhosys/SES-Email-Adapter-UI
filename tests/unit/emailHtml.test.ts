import { describe, it, expect } from 'vitest'
import { wrapEmailHtml } from '@/lib/emailHtml'

describe('wrapEmailHtml — table overflow prevention', () => {
  it('does not override explicit table width — preserves centered container layout', () => {
    const centered = '<table style="width:640px;margin:0 auto"><tr><td>Content</td></tr></table>'
    const result = wrapEmailHtml(centered)

    // The injected CSS must NOT contain "width: auto" which would destroy
    // the sender's explicit width used for centering via margin: 0 auto.
    expect(result).not.toMatch(/table\s*\{[^}]*width:\s*auto/)
  })

  it('constrains wide tables via max-width so they cannot overflow the iframe', () => {
    const wide = '<table style="width:1200px"><tr><td>Wide content</td></tr></table>'
    const result = wrapEmailHtml(wide)

    // The injected CSS must include max-width: 100% on tables to prevent overflow.
    expect(result).toMatch(/table\s*\{[^}]*max-width:\s*100%/)
  })
})
