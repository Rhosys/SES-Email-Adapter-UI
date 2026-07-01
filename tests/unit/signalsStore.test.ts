import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { useSignalsStore } from '@/stores/signals'
import { useAccountStore } from '@/stores/account'
import type { Signal, Account, Pagination } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listSignals: vi.fn(),
      patchThread: vi.fn(),
      createDraftSignal: vi.fn(),
    },
  }
})

vi.mock('@/lib/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn(), critical: vi.fn(), track: vi.fn() },
}))

import { api, ApiError } from '@/lib/api'
import logger from '@/lib/logger'

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

function mockSignalList(items: Signal[], pagination: Pagination = { cursor: null }) {
  return { signals: items, pagination }
}

describe('signalsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  it('fetchAll populates items', async () => {
    vi.mocked(api.listSignals).mockResolvedValue(ok(mockSignalList([mockSignal()])))

    const store = useSignalsStore()
    await store.fetchAll('thread_1')

    expect(store.items).toHaveLength(1)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('sets error when signals fetch fails', async () => {
    vi.mocked(api.listSignals).mockResolvedValue(err(new ApiError(500, 'Server error')))

    const store = useSignalsStore()
    await store.fetchAll('thread_1')

    expect(store.error).toBe('Server error')
  })

  it('latestSignal is the first item (newest first)', async () => {
    const sig1 = mockSignal({ signalId: 'sig_1' })
    const sig2 = mockSignal({ signalId: 'sig_2' })
    // API returns oldest first; store reverses
    vi.mocked(api.listSignals).mockResolvedValue(ok(mockSignalList([sig1, sig2])))

    const store = useSignalsStore()
    await store.fetchAll('thread_1')

    expect(store.latestSignal?.signalId).toBe('sig_2')
  })

  it('hasMore is true when nextCursor is set', async () => {
    vi.mocked(api.listSignals).mockResolvedValue(
      ok(mockSignalList([mockSignal()], { cursor: 'cursor_abc' })),
    )

    const store = useSignalsStore()
    await store.fetchAll('thread_1')

    expect(store.hasMore).toBe(true)
  })

  it('createDraft prepends the new draft (newest first)', async () => {
    const existing = mockSignal({ signalId: 'sig_1' })
    vi.mocked(api.listSignals).mockResolvedValue(ok(mockSignalList([existing])))

    const store = useSignalsStore()
    await store.fetchAll('thread_1')

    const draft = mockSignal({ signalId: 'sig_draft', status: 'draft' })
    vi.mocked(api.createDraftSignal).mockResolvedValue(ok(draft))

    await store.createDraft('thread_1')

    expect(store.items.map((s) => s.signalId)).toEqual(['sig_draft', 'sig_1'])
    expect(store.latestSignal?.signalId).toBe('sig_draft')
  })

  it('reset clears all state', async () => {
    vi.mocked(api.listSignals).mockResolvedValue(ok(mockSignalList([mockSignal()])))

    const store = useSignalsStore()
    await store.fetchAll('thread_1')
    store.reset()

    expect(store.items).toHaveLength(0)
    expect(store.error).toBeNull()
  })
})

describe('stale-while-revalidate', { timeout: 5000 }, () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  it('fetchAll with cached data does not show loading state', async () => {
    const store = useSignalsStore()
    store.$patch({ _byAccount: { acc_1: { thread_1: [mockSignal()] } } })

    vi.mocked(api.listSignals).mockResolvedValue(ok(mockSignalList([mockSignal()])))
    await store.fetchAll('thread_1')

    expect(store.loading).toBe(false)
  })

  it('fetchAll merges fresh signals with cached (deduplicates by signalId)', async () => {
    const sigA = mockSignal({ signalId: 'sig_A', createdAt: '2025-01-01T10:00:00Z' })
    const sigB = mockSignal({ signalId: 'sig_B', createdAt: '2025-01-01T11:00:00Z' })
    const sigC = mockSignal({ signalId: 'sig_C', createdAt: '2025-01-01T12:00:00Z' })

    const store = useSignalsStore()
    store.$patch({ _byAccount: { acc_1: { thread_1: [sigA, sigB] } } })

    // API returns [sig_B, sig_C] (oldest first — store reverses to [sig_C, sig_B])
    vi.mocked(api.listSignals).mockResolvedValue(ok(mockSignalList([sigB, sigC])))
    await store.fetchAll('thread_1')

    // Fresh first (reversed): [sig_C, sig_B], then older cached not in fresh: [sig_A]
    expect(store.items.map((s) => s.signalId)).toEqual(['sig_C', 'sig_B', 'sig_A'])
  })

  it('fetchAll failure with cached data retains cache and logs warning', async () => {
    const store = useSignalsStore()
    store.$patch({ _byAccount: { acc_1: { thread_1: [mockSignal({ signalId: 'sig_cached' })] } } })

    vi.mocked(api.listSignals).mockResolvedValue(err(new ApiError(500, 'Server error')))
    await store.fetchAll('thread_1')

    expect(store.items).toHaveLength(1)
    expect(store.items[0].signalId).toBe('sig_cached')
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Signals fetch failed with cache available' }),
    )
    expect(store.error).toBeNull()
  })
})
