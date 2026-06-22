import type { Alias } from '@/types/server'

export const mockAliases: Alias[] = [
  {
    alias: 'alias_1',
    address: 'hello@demo.catchmail.app',
    unknownSenderPolicy: 'quarantine_visible',
    createdAt: '2026-01-05T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  },
  {
    alias: 'alias_2',
    address: 'receipts@demo.catchmail.app',
    unknownSenderPolicy: 'allow_all',
    createdAt: '2026-01-10T00:00:00Z',
    updatedAt: '2026-05-15T00:00:00Z',
  },
  {
    alias: 'alias_3',
    address: 'newsletters@demo.catchmail.app',
    unknownSenderPolicy: 'allow_all',
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-04-20T00:00:00Z',
  },
  {
    alias: 'alias_4',
    address: 'work@demo.catchmail.app',
    unknownSenderPolicy: 'quarantine_hidden',
    createdAt: '2026-02-15T00:00:00Z',
    updatedAt: '2026-06-05T00:00:00Z',
  },
  {
    alias: 'alias_5',
    address: 'spam-trap@demo.catchmail.app',
    unknownSenderPolicy: 'block_reject',
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
  },
]
