import type { AliasSender } from '@/types/server'

/** Mock senders keyed by alias address */
export const mockSenders: Record<string, AliasSender[]> = {
  'hello@demo.catchmail.app': [
    { alias: 'hello@demo.catchmail.app', sender: 'github.com', policy: 'allow', createdAt: '2026-02-10T00:00:00Z', updatedAt: '2026-02-10T00:00:00Z' },
    { alias: 'hello@demo.catchmail.app', sender: 'stripe.com', policy: 'allow', createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z' },
    { alias: 'hello@demo.catchmail.app', sender: 'sketchy-deals.xyz', policy: 'block_hidden', createdAt: '2026-04-15T00:00:00Z', updatedAt: '2026-04-15T00:00:00Z' },
  ],
  'receipts@demo.catchmail.app': [
    { alias: 'receipts@demo.catchmail.app', sender: 'amazon.com', policy: 'allow', createdAt: '2026-01-20T00:00:00Z', updatedAt: '2026-01-20T00:00:00Z' },
    { alias: 'receipts@demo.catchmail.app', sender: 'uber.com', policy: 'allow', createdAt: '2026-02-05T00:00:00Z', updatedAt: '2026-02-05T00:00:00Z' },
  ],
  'newsletters@demo.catchmail.app': [
    { alias: 'newsletters@demo.catchmail.app', sender: 'substack.com', policy: 'allow', createdAt: '2026-02-15T00:00:00Z', updatedAt: '2026-02-15T00:00:00Z' },
    { alias: 'newsletters@demo.catchmail.app', sender: 'spammer.net', policy: 'violate_report', createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-05-01T00:00:00Z' },
  ],
  'work@demo.catchmail.app': [],
  'spam-trap@demo.catchmail.app': [],
}
