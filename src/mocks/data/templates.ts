import type { EmailTemplate } from '@/types/server'

export const mockTemplates: EmailTemplate[] = [
  {
    templateId: 'tpl_1',
    name: 'Auto-reply: Out of Office',
    subject: 'Re: {{signal.subject}}',
    body: '<p>Thanks for reaching out. I am currently out of the office and will respond when I return on {{returnDate}}.</p><p>For urgent matters, please contact {{urgentContact}}.</p>',
    functions: [
      { name: 'returnDate', code: 'return new Date(Date.now() + 7 * 86400000).toLocaleDateString()' },
      { name: 'urgentContact', code: 'return "support@demo.catchmail.app"' },
    ],
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-05-10T00:00:00Z',
  },
  {
    templateId: 'tpl_2',
    name: 'Receipt Acknowledgement',
    subject: 'Got it: {{signal.subject}}',
    body: '<p>Hi {{senderName}},</p><p>Confirming I received your invoice. I will process this within 5 business days.</p><p>Thanks,<br/>Warren</p>',
    functions: [
      { name: 'senderName', code: 'return signal.from.name || signal.from.address.split("@")[0]' },
    ],
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
  },
  {
    templateId: 'tpl_3',
    name: 'Newsletter Unsubscribe Request',
    subject: 'Unsubscribe request',
    body: '<p>Hello,</p><p>Please remove {{recipientAddress}} from your mailing list.</p><p>If there is a specific link I should use, my system was unable to extract it. Please confirm removal.</p>',
    functions: [
      { name: 'recipientAddress', code: 'return signal.recipientAddress || "my address"' },
    ],
    createdAt: '2026-04-15T00:00:00Z',
    updatedAt: '2026-04-15T00:00:00Z',
  },
]
