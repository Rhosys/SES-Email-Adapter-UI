import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { useSignalsStore } from '@/stores/signals'
import { useAccountStore } from '@/stores/account'
import type { Arc, Signal, Account, Pagination } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      getArc: vi.fn(),
      listSignals: vi.fn(),
      patchArc: vi.fn(),
    },
  }
})

import { api, ApiError } from '@/lib/api'

function mockArc(overrides: Partial<Arc> = {}): Arc {
  return {
    arcId: 'arc_1',
    workflow: 'conversation',
    labels: [],
    status: 'active',
    summary: 'Test arc',
    lastSignalAt: '2025-01-01T12:00:00Z',
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-01T12:00:00Z',
    ...overrides,
  }
}

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

  it('fetchAll populates arc and items', async () => {
    vi.mocked(api.getArc).mockResolvedValue(ok(mockArc()))
    vi.mocked(api.listSignals).mockResolvedValue(ok(mockSignalList([mockSignal()])))

    const store = useSignalsStore()
    await store.fetchAll('arc_1')

    expect(store.arc?.arcId).toBe('arc_1')
    expect(store.items).toHaveLength(1)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('sets error when arc fetch fails', async () => {
    vi.mocked(api.getArc).mockResolvedValue(err(new ApiError(404, 'Not found')))
    vi.mocked(api.listSignals).mockResolvedValue(ok(mockSignalList([])))

    const store = useSignalsStore()
    await store.fetchAll('arc_1')

    expect(store.error).toBe('Not found')
    expect(store.arc).toBeNull()
  })

  it('sets error when signals fetch fails', async () => {
    vi.mocked(api.getArc).mockResolvedValue(ok(mockArc()))
    vi.mocked(api.listSignals).mockResolvedValue(err(new ApiError(500, 'Server error')))

    const store = useSignalsStore()
    await store.fetchAll('arc_1')

    expect(store.error).toBe('Server error')
  })

  it('latestSignal is the first item (newest first)', async () => {
    const sig1 = mockSignal({ signalId: 'sig_1' })
    const sig2 = mockSignal({ signalId: 'sig_2' })
    vi.mocked(api.getArc).mockResolvedValue(ok(mockArc()))
    // API returns oldest first; store reverses
    vi.mocked(api.listSignals).mockResolvedValue(ok(mockSignalList([sig1, sig2])))

    const store = useSignalsStore()
    await store.fetchAll('arc_1')

    expect(store.latestSignal?.signalId).toBe('sig_2')
  })

  it('hasMore is true when nextCursor is set', async () => {
    vi.mocked(api.getArc).mockResolvedValue(ok(mockArc()))
    vi.mocked(api.listSignals).mockResolvedValue(
      ok(mockSignalList([mockSignal()], { cursor: 'cursor_abc' })),
    )

    const store = useSignalsStore()
    await store.fetchAll('arc_1')

    expect(store.hasMore).toBe(true)
  })

  it('reset clears all state', async () => {
    vi.mocked(api.getArc).mockResolvedValue(ok(mockArc()))
    vi.mocked(api.listSignals).mockResolvedValue(ok(mockSignalList([mockSignal()])))

    const store = useSignalsStore()
    await store.fetchAll('arc_1')
    store.reset()

    expect(store.arc).toBeNull()
    expect(store.items).toHaveLength(0)
    expect(store.error).toBeNull()
  })
})
