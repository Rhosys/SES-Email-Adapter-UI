import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { QueryClient } from '@tanstack/vue-query'
import { useSignalCacheHelpers } from '@/composables/useSignalQueries'
import { useAccountStore } from '@/stores/account'
import { queryKeys } from '@/lib/queryKeys'
import type { Signal, Account } from '@/types/server'

// Mock useQueryClient to return a test QueryClient
const testQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
vi.mock('@tanstack/vue-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/vue-query')>()
  return {
    ...actual,
    useQueryClient: () => testQueryClient,
  }
})

function mockSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    signalId: 'sig_1',
    threadId: 'thread_1',
    type: 'email',
    source: 'system',
    status: 'active',
    createdAt: '2025-01-01T12:00:00Z',
    data: {
      receivedAt: '2025-01-01T12:00:00Z',
      summary: 'Test',
      from: { address: 'sender@example.com', name: 'Sender' },
      to: [{ address: 'inbox@example.com' }],
      cc: [],
      subject: 'Test subject',
      attachments: [],
      headers: {},
      recipientAddress: 'inbox@example.com',
      workflow: 'conversation',
      spamScore: 0,
    },
    ...overrides,
  } as Signal
}

describe('useSignalCacheHelpers (query cache helpers)', () => {
  beforeEach(() => {
    testQueryClient.clear()
    setActivePinia(createPinia())

    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  it('threadSignals returns signals from the query cache', () => {
    const sig = mockSignal()
    testQueryClient.setQueryData(queryKeys.signals.byThread('acc_1', 'thread_1'), {
      pages: [{ signals: [sig], pagination: { cursor: null } }],
      pageParams: [undefined],
    })

    const { threadSignals } = useSignalCacheHelpers()
    expect(threadSignals('thread_1')).toHaveLength(1)
    expect(threadSignals('thread_1')[0].signalId).toBe('sig_1')
  })

  it('threadSignals returns empty array for uncached thread', () => {
    const { threadSignals } = useSignalCacheHelpers()
    expect(threadSignals('thread_unknown')).toEqual([])
  })

  it('updateSignal patches a cached signal in place', () => {
    const sig = mockSignal()
    testQueryClient.setQueryData(queryKeys.signals.byThread('acc_1', 'thread_1'), {
      pages: [{ signals: [sig], pagination: { cursor: null } }],
      pageParams: [undefined],
    })

    const { threadSignals, updateSignal } = useSignalCacheHelpers()
    const updated = mockSignal({ signalId: 'sig_1', status: 'draft' })
    updateSignal('thread_1', updated)

    expect(threadSignals('thread_1')[0].status).toBe('draft')
  })

  it('removeSignal removes a signal from the cache', () => {
    const sig1 = mockSignal({ signalId: 'sig_1' })
    const sig2 = mockSignal({ signalId: 'sig_2' })
    testQueryClient.setQueryData(queryKeys.signals.byThread('acc_1', 'thread_1'), {
      pages: [{ signals: [sig1, sig2], pagination: { cursor: null } }],
      pageParams: [undefined],
    })

    const { threadSignals, removeSignal } = useSignalCacheHelpers()
    removeSignal('thread_1', 'sig_1')

    const remaining = threadSignals('thread_1')
    expect(remaining).toHaveLength(1)
    expect(remaining[0].signalId).toBe('sig_2')
  })

  it('allSignals aggregates signals across all cached threads', () => {
    testQueryClient.setQueryData(queryKeys.signals.byThread('acc_1', 'thread_1'), {
      pages: [{ signals: [mockSignal({ signalId: 'sig_1' })], pagination: { cursor: null } }],
      pageParams: [undefined],
    })
    testQueryClient.setQueryData(queryKeys.signals.byThread('acc_1', 'thread_2'), {
      pages: [{ signals: [mockSignal({ signalId: 'sig_2', threadId: 'thread_2' })], pagination: { cursor: null } }],
      pageParams: [undefined],
    })

    const { allSignals } = useSignalCacheHelpers()
    expect(allSignals()).toHaveLength(2)
  })
})
