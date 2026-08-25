import { describe, it, expect } from 'vitest'
import { stripAttachmentsFromRawEmail } from '@/lib/stripAttachments'

function buildRawEmail(attachmentBase64: string): string {
  const boundary = '----=_Part_test_boundary'
  return [
    'From: sender@example.com',
    'To: recipient@example.com',
    'Subject: Test email with attachment',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    'This is the visible body text.',
    '',
    `--${boundary}`,
    'Content-Type: application/pdf',
    'Content-Transfer-Encoding: base64',
    'Content-Disposition: attachment; filename="document.pdf"',
    '',
    attachmentBase64,
    '',
    `--${boundary}--`,
  ].join('\r\n')
}

describe('stripAttachmentsFromRawEmail', () => {
  it('replaces an attachment body with a placeholder, keeping its headers', () => {
    const raw = buildRawEmail('SGVsbG8gd29ybGQh'.repeat(50))
    const result = stripAttachmentsFromRawEmail(raw)

    expect(result).toContain('Content-Disposition: attachment; filename="document.pdf"')
    expect(result).toContain('[attachment content omitted: document.pdf')
    expect(result).not.toContain('SGVsbG8gd29ybGQh')
  })

  it('leaves the visible text body untouched', () => {
    const raw = buildRawEmail('SGVsbG8gd29ybGQh'.repeat(50))
    const result = stripAttachmentsFromRawEmail(raw)

    expect(result).toContain('This is the visible body text.')
  })

  it('leaves non-multipart plain-text emails unchanged', () => {
    const raw = [
      'From: sender@example.com',
      'To: recipient@example.com',
      'Subject: Plain text email',
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      '',
      'Just a plain message, no attachments.',
    ].join('\r\n')

    expect(stripAttachmentsFromRawEmail(raw)).toBe(raw)
  })

  it('strips an inline image body identified by a filename= parameter without Content-Disposition: attachment', () => {
    const boundary = '----=_Part_related_boundary'
    const raw = [
      'From: sender@example.com',
      'To: recipient@example.com',
      'Subject: Test email with inline image',
      'MIME-Version: 1.0',
      `Content-Type: multipart/related; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      '',
      '<html><body>Logo: <img src="cid:logo@test"></body></html>',
      '',
      `--${boundary}`,
      'Content-Type: image/png; name="logo.png"',
      'Content-Transfer-Encoding: base64',
      'Content-ID: <logo@test>',
      'Content-Disposition: inline; filename="logo.png"',
      '',
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'.repeat(20),
      '',
      `--${boundary}--`,
    ].join('\r\n')

    const result = stripAttachmentsFromRawEmail(raw)
    expect(result).toContain('<img src="cid:logo@test">')
    expect(result).toContain('[attachment content omitted: logo.png')
    expect(result).not.toContain('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB')
  })

  it('leaves multiple attachments in a multi-part message each replaced independently', () => {
    const boundary = '----=_Part_multi_boundary'
    const raw = [
      'From: sender@example.com',
      'To: recipient@example.com',
      'Subject: Two attachments',
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      'Body text.',
      '',
      `--${boundary}`,
      'Content-Type: application/pdf',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename="a.pdf"',
      '',
      'QQ=='.repeat(50),
      '',
      `--${boundary}`,
      'Content-Type: image/png',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename="b.png"',
      '',
      'Qg=='.repeat(50),
      '',
      `--${boundary}--`,
    ].join('\r\n')

    const result = stripAttachmentsFromRawEmail(raw)
    expect(result).toContain('[attachment content omitted: a.pdf')
    expect(result).toContain('[attachment content omitted: b.png')
    expect(result).not.toContain('QQ==QQ==')
    expect(result).not.toContain('Qg==Qg==')
  })
})
