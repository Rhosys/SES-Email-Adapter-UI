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
      patchArc: vi.fn(),
    },
  }
})

import { api, ApiError } from '@/lib/api'

function mockSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    signalId: 'sig_1',
    arcId: 'arc_1',
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
    await store.fetchAll('arc_1')

    expect(store.items).toHaveLength(1)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('sets error when signals fetch fails', async () => {
    vi.mocked(api.listSignals).mockResolvedValue(err(new ApiError(500, 'Server error')))

    const store = useSignalsStore()
    await store.fetchAll('arc_1')

    expect(store.error).toBe('Server error')
  })

  it('latestSignal is the first item (newest first)', async () => {
    const sig1 = mockSignal({ signalId: 'sig_1' })
    const sig2 = mockSignal({ signalId: 'sig_2' })
    // API returns oldest first; store reverses
    vi.mocked(api.listSignals).mockResolvedValue(ok(mockSignalList([sig1, sig2])))

    const store = useSignalsStore()
    await store.fetchAll('arc_1')

    expect(store.latestSignal?.signalId).toBe('sig_2')
  })

  it('hasMore is true when nextCursor is set', async () => {
    vi.mocked(api.listSignals).mockResolvedValue(
      ok(mockSignalList([mockSignal()], { cursor: 'cursor_abc' })),
    )

    const store = useSignalsStore()
    await store.fetchAll('arc_1')

    expect(store.hasMore).toBe(true)
  })

  it('reset clears all state', async () => {
    vi.mocked(api.listSignals).mockResolvedValue(ok(mockSignalList([mockSignal()])))

    const store = useSignalsStore()
    await store.fetchAll('arc_1')
    store.reset()

    expect(store.items).toHaveLength(0)
    expect(store.error).toBeNull()
  })
})
