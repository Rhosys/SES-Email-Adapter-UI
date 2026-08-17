export const queryKeys = {
  threads: {
    all: (accountId: string) => ['threads', accountId] as const,
    list: (accountId: string, status?: string) =>
      status ? (['threads', accountId, { status }] as const) : (['threads', accountId] as const),
    detail: (accountId: string, threadId: string) => ['threads', accountId, threadId] as const,
  },
  signals: {
    all: (accountId: string) => ['signals', accountId] as const,
    byThread: (accountId: string, threadId: string) => ['signals', accountId, threadId] as const,
  },
  quarantine: {
    all: (accountId: string) => ['quarantine', accountId] as const,
    list: (accountId: string, filters: { sender?: string; after?: string; before?: string }) =>
      ['quarantine', accountId, filters] as const,
  },
  spam: {
    all: (accountId: string) => ['spam', accountId] as const,
    list: (accountId: string, filters: { sender?: string; after?: string; before?: string }) =>
      ['spam', accountId, filters] as const,
  },
  stats: (accountId: string) => ['stats', accountId] as const,
  rules: {
    all: (accountId: string) => ['rules', accountId] as const,
  },
  labels: {
    all: (accountId: string) => ['labels', accountId] as const,
  },
  views: {
    all: (accountId: string) => ['views', accountId] as const,
  },
  templates: {
    all: (accountId: string) => ['templates', accountId] as const,
  },
  resources: {
    all: (accountId: string) => ['resources', accountId] as const,
    list: (accountId: string, params: { status?: string; dateFrom?: string }) =>
      ['resources', accountId, params] as const,
  },
  senderIdentities: (accountId: string) => ['senderIdentities', accountId] as const,
} as const
