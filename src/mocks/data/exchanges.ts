import type { ExternalMailExchange } from '@/types/server'

export const mockExchanges: ExternalMailExchange[] = [
  {
    exchangeId: 'emx_1',
    accountId: 'acc_demo',
    platform: 'imap',
    emailAddress: 'ada@fastmail-legacy.example',
    status: 'active',
    syncCursor: null,
    lastSyncAt: '2026-06-10T09:12:00Z',
    nextSyncTime: '2026-06-10T09:22:00Z',
    createdAt: '2026-03-11T00:00:00Z',
    imapConfig: {
      host: 'imap.fastmail-legacy.example',
      tlsConfig: 'TLS',
      username: 'ada@fastmail-legacy.example',
    },
  },
  {
    exchangeId: 'emx_2',
    accountId: 'acc_demo',
    platform: 'jmap',
    emailAddress: 'ada.lovelace@jmap-host.example',
    status: 'active',
    syncCursor: null,
    lastSyncAt: '2026-06-10T09:05:00Z',
    nextSyncTime: '2026-06-10T09:15:00Z',
    createdAt: '2026-04-02T00:00:00Z',
    jmapConfig: {
      sessionUrl: 'https://jmap-host.example/.well-known/jmap',
      username: 'ada.lovelace@jmap-host.example',
    },
  },
]
