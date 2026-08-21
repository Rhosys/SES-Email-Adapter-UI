import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { QueryClient } from '@tanstack/vue-query'
import { useSignalStoreMutator } from '@/composables/useSignalQueries'
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

type InfiniteSignalData = {
  pages: Array<{ signals: Signal[]; pagination: { cursor: string | null } }>
  pageParams: Array<string | undefined>
}

describe('useSignalStoreMutator', () => {
  beforeEach(() => {
    testQueryClient.clear()
    setActivePinia(createPinia())

    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  it('updateSignal patches a cached signal in place', () => {
    const sig = mockSignal()
    testQueryClient.setQueryData(queryKeys.signals.byThread('acc_1', 'thread_1'), {
      pages: [{ signals: [sig], pagination: { cursor: null } }],
      pageParams: [undefined],
    })

    const { updateSignal } = useSignalStoreMutator()
    const updated = mockSignal({ signalId: 'sig_1', status: 'draft' })
    updateSignal('thread_1', updated)

    const data = testQueryClient.getQueryData<InfiniteSignalData>(queryKeys.signals.byThread('acc_1', 'thread_1'))
    expect(data?.pages[0].signals[0].status).toBe('draft')
  })

  it('removeSignal removes a signal from the cache', () => {
    const sig1 = mockSignal({ signalId: 'sig_1' })
    const sig2 = mockSignal({ signalId: 'sig_2' })
    testQueryClient.setQueryData(queryKeys.signals.byThread('acc_1', 'thread_1'), {
      pages: [{ signals: [sig1, sig2], pagination: { cursor: null } }],
      pageParams: [undefined],
    })

    const { removeSignal } = useSignalStoreMutator()
    removeSignal('thread_1', 'sig_1')

    const data = testQueryClient.getQueryData<InfiniteSignalData>(queryKeys.signals.byThread('acc_1', 'thread_1'))
    expect(data?.pages[0].signals).toHaveLength(1)
    expect(data?.pages[0].signals[0].signalId).toBe('sig_2')
  })

  it('updateSignal is a no-op when accountId is missing', () => {
    const accountStore = useAccountStore()
    accountStore.account = null as unknown as Account

    const { updateSignal } = useSignalStoreMutator()
    updateSignal('thread_1', mockSignal())

    const data = testQueryClient.getQueryData<InfiniteSignalData>(queryKeys.signals.byThread('acc_1', 'thread_1'))
    expect(data).toBeUndefined()
  })

  it('removeSignal is a no-op when accountId is missing', () => {
    const accountStore = useAccountStore()
    accountStore.account = null as unknown as Account

    const { removeSignal } = useSignalStoreMutator()
    removeSignal('thread_1', 'sig_1')

    const data = testQueryClient.getQueryData<InfiniteSignalData>(queryKeys.signals.byThread('acc_1', 'thread_1'))
    expect(data).toBeUndefined()
  })
})
