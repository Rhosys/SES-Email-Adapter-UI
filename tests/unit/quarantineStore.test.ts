import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err, type Result } from 'neverthrow'
import { useQuarantineStore } from '@/stores/quarantine'
import { useAccountStore } from '@/stores/account'
import type { Signal, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listQuarantinedSignals: vi.fn(),
      quarantineResponse: vi.fn(),
      addAliasSender: vi.fn(),
    },
  }
})

vi.mock('@/lib/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn(), critical: vi.fn(), track: vi.fn() },
}))

import { api, ApiError } from '@/lib/api'
import logger from '@/lib/logger'

function mockSignal(overrides: Partial<Signal> & { signalId?: string; status?: string } = {}): Signal {
  const { signalId = 'sig_1', status = 'quarantine_visible', ...rest } = overrides
  return {
    signalId,
    arcId: 'arc_1',
    type: 'email',
    source: 'system',
    status,
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
      matchedRules: [{ ruleId: 'rule_1', actions: [], labelsAdded: ['system:sender:untrusted'] }],
    },
    ...rest,
  } as Signal
}

function mockBothCalls(
  visItems: Signal[],
  hidItems: Signal[],
  visCursor?: string,
  hidCursor?: string,
) {
  vi.mocked(api.listQuarantinedSignals)
    .mockResolvedValueOnce(ok({ signals: visItems, pagination: { cursor: visCursor ?? null } }))
    .mockResolvedValueOnce(ok({ signals: hidItems, pagination: { cursor: hidCursor ?? null } }))
}

describe('quarantineStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  it('fetchSignals keeps visible and hidden in separate buckets, each sorted by receivedAt desc', async () => {
    const vis1 = mockSignal({ signalId: 'v1', createdAt: '2025-01-01T10:00:00Z' })
    const vis2 = mockSignal({ signalId: 'v2', createdAt: '2025-01-01T08:00:00Z' })
    const hid1 = mockSignal({ signalId: 'h1', status: 'quarantine_hidden', createdAt: '2025-01-01T12:00:00Z' })
    mockBothCalls([vis2, vis1], [hid1])

    const store = useQuarantineStore()
    await store.fetchSignals(true)

    // visible-first ordering is maintained; each bucket sorted by receivedAt desc
    expect(store.quarantineVisible.map((s) => s.signalId)).toEqual(['v1', 'v2'])
    expect(store.quarantineHidden.map((s) => s.signalId)).toEqual(['h1'])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('fetchSignals sets error when visible call fails', async () => {
    vi.mocked(api.listQuarantinedSignals)
      .mockResolvedValueOnce(err(new ApiError(500, 'Server error')))
      .mockResolvedValueOnce(ok({ signals: [], pagination: { cursor: null } }))

    const store = useQuarantineStore()
    await store.fetchSignals(true)

    expect(store.quarantineVisible).toHaveLength(0)
    expect(store.quarantineHidden).toHaveLength(0)
    expect(store.error).toBe('Server error')
  })

  it('fetchSignals sets error when hidden call fails', async () => {
    vi.mocked(api.listQuarantinedSignals)
      .mockResolvedValueOnce(ok({ signals: [], pagination: { cursor: null } }))
      .mockResolvedValueOnce(err(new ApiError(503, 'Hidden fetch failed')))

    const store = useQuarantineStore()
    await store.fetchSignals(true)

    expect(store.error).toBe('Hidden fetch failed')
  })

  it('fetchSignals resets both buckets when reset=true', async () => {
    mockBothCalls([mockSignal()], [])
    const store = useQuarantineStore()
    await store.fetchSignals(true)
    expect(store.quarantineVisible).toHaveLength(1)

    mockBothCalls([], [])
    await store.fetchSignals(true)
    expect(store.quarantineVisible).toHaveLength(0)
    expect(store.quarantineHidden).toHaveLength(0)
  })

  it('hasMore is true when either cursor is set', async () => {
    mockBothCalls([mockSignal()], [], 'cursor_vis', undefined)
    const store = useQuarantineStore()
    await store.fetchSignals(true)
    expect(store.hasMore).toBe(true)
  })

  it('hasMore is false when no cursors', async () => {
    mockBothCalls([mockSignal()], [])
    const store = useQuarantineStore()
    await store.fetchSignals(true)
    expect(store.hasMore).toBe(false)
  })

  it('fetchMore loads next visible page before hidden pages', async () => {
    mockBothCalls([mockSignal({ signalId: 'v1' })], [mockSignal({ signalId: 'h1', status: 'quarantine_hidden' })], 'cur_v', 'cur_h')
    const store = useQuarantineStore()
    await store.fetchSignals(true)

    // fetchMore should request the visible cursor next
    vi.mocked(api.listQuarantinedSignals).mockResolvedValueOnce(
      ok({ signals: [mockSignal({ signalId: 'v2' })], pagination: { cursor: null } }),
    )
    await store.fetchMore()

    expect(vi.mocked(api.listQuarantinedSignals)).toHaveBeenLastCalledWith(
      'acc_1',
      'quarantine_visible',
      expect.objectContaining({ cursor: 'cur_v' }),
    )
    expect(store.quarantineVisible.map((s) => s.signalId)).toContain('v2')
    // hidden cursor still pending
    expect(store.hasMore).toBe(true)
  })

  it('fetchMore loads hidden page once visible is exhausted', async () => {
    mockBothCalls([], [mockSignal({ signalId: 'h1', status: 'quarantine_hidden' })], undefined, 'cur_h')
    const store = useQuarantineStore()
    await store.fetchSignals(true)

    vi.mocked(api.listQuarantinedSignals).mockResolvedValueOnce(
      ok({ signals: [mockSignal({ signalId: 'h2', status: 'quarantine_hidden' })], pagination: { cursor: null } }),
    )
    await store.fetchMore()

    expect(vi.mocked(api.listQuarantinedSignals)).toHaveBeenLastCalledWith(
      'acc_1',
      'quarantine_hidden',
      expect.objectContaining({ cursor: 'cur_h' }),
    )
    expect(store.quarantineHidden.map((s) => s.signalId)).toContain('h2')
    expect(store.hasMore).toBe(false)
  })

  it('allow removes signal from visible items on success', async () => {
    mockBothCalls([mockSignal({ signalId: 'sig_1' }), mockSignal({ signalId: 'sig_2' })], [])
    const store = useQuarantineStore()
    await store.fetchSignals(true)

    vi.mocked(api.quarantineResponse).mockResolvedValue(ok(mockSignal({ status: 'active' })))
    const result = await store.allow('sig_1')
    expect(result).toBe(true)
    expect(store.quarantineVisible.map((s) => s.signalId)).toEqual(['sig_2'])
    expect(vi.mocked(api.quarantineResponse)).toHaveBeenCalledWith('acc_1', 'sig_1', 'active')
  })

  it('allow sets error and returns false on failure', async () => {
    mockBothCalls([mockSignal()], [])
    const store = useQuarantineStore()
    await store.fetchSignals(true)

    vi.mocked(api.quarantineResponse).mockResolvedValue(err(new ApiError(500, 'Failed')))
    const result = await store.allow('sig_1')
    expect(result).toBe(false)
    expect(store.error).toBe('Failed')
    expect(store.quarantineVisible).toHaveLength(1)
  })

  it('reject removes signal from list on success', async () => {
    mockBothCalls([mockSignal({ signalId: 'sig_1' })], [])
    const store = useQuarantineStore()
    await store.fetchSignals(true)

    vi.mocked(api.quarantineResponse).mockResolvedValue(ok(mockSignal({ status: 'block_hidden' })))
    const result = await store.reject('sig_1')
    expect(result).toBe(true)
    expect(store.quarantineVisible).toHaveLength(0)
    expect(vi.mocked(api.quarantineResponse)).toHaveBeenCalledWith('acc_1', 'sig_1', 'block_hidden')
  })

  it('reject sets error and returns false on failure', async () => {
    mockBothCalls([mockSignal()], [])
    const store = useQuarantineStore()
    await store.fetchSignals(true)

    vi.mocked(api.quarantineResponse).mockResolvedValue(err(new ApiError(500, 'Failed')))
    const result = await store.reject('sig_1')
    expect(result).toBe(false)
    expect(store.error).toBe('Failed')
    expect(store.quarantineVisible).toHaveLength(1)
  })

  it('actionPending tracks in-flight signal ids', async () => {
    mockBothCalls([mockSignal()], [])
    const store = useQuarantineStore()
    await store.fetchSignals(true)

    let resolve!: () => void
    vi.mocked(api.quarantineResponse).mockReturnValue(
      new Promise<Result<Signal, ApiError>>((res) => {
        resolve = () => res(ok(mockSignal({ status: 'active' })))
      }),
    )
    const p = store.allow('sig_1')
    expect(store.actionPending.has('sig_1')).toBe(true)
    resolve()
    await p
    expect(store.actionPending.has('sig_1')).toBe(false)
  })

  it('setFilters merges filter fields', () => {
    const store = useQuarantineStore()
    store.setFilters({ sender: 'test@example.com', after: '2025-01-01' })
    expect(store.filters.sender).toBe('test@example.com')
    expect(store.filters.after).toBe('2025-01-01')
    expect(store.filters.before).toBe('')
  })

  it('clearError resets error', () => {
    const store = useQuarantineStore()
    store.error = 'some error'
    store.clearError()
    expect(store.error).toBeNull()
  })
})

describe('stale-while-revalidate', { timeout: 5000 }, () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fetchSignals with cached data does not show loading state', async () => {
    const store = useQuarantineStore()
    // Populate cache via a successful fetch first (_byAccount is private)
    vi.mocked(api.listQuarantinedSignals)
      .mockResolvedValueOnce(ok({ signals: [mockSignal({ signalId: 'v1' })], pagination: { cursor: null } }))
      .mockResolvedValueOnce(ok({ signals: [mockSignal({ signalId: 'h1', status: 'quarantine_hidden' })], pagination: { cursor: null } }))
    await store.fetchSignals(true)
    expect(store.quarantineVisible).toHaveLength(1)

    vi.mocked(api.listQuarantinedSignals)
      .mockResolvedValueOnce(ok({ signals: [mockSignal({ signalId: 'v1' })], pagination: { cursor: null } }))
      .mockResolvedValueOnce(ok({ signals: [mockSignal({ signalId: 'h1', status: 'quarantine_hidden' })], pagination: { cursor: null } }))

    await store.fetchSignals()

    expect(store.loading).toBe(false)
  })

  it('fetchSignals failure with cached data retains cache and logs warning', async () => {
    const store = useQuarantineStore()
    // Populate cache via a successful fetch first
    vi.mocked(api.listQuarantinedSignals)
      .mockResolvedValueOnce(ok({ signals: [mockSignal({ signalId: 'v_cached' })], pagination: { cursor: null } }))
      .mockResolvedValueOnce(ok({ signals: [mockSignal({ signalId: 'h_cached', status: 'quarantine_hidden' })], pagination: { cursor: null } }))
    await store.fetchSignals(true)
    expect(store.quarantineVisible).toHaveLength(1)

    vi.mocked(api.listQuarantinedSignals)
      .mockResolvedValueOnce(err(new ApiError(500, 'Visible fetch failed')))
      .mockResolvedValueOnce(err(new ApiError(500, 'Hidden fetch failed')))

    await store.fetchSignals()

    expect(store.quarantineVisible).toHaveLength(1)
    expect(store.quarantineVisible[0].signalId).toBe('v_cached')
    expect(store.quarantineHidden).toHaveLength(1)
    expect(store.quarantineHidden[0].signalId).toBe('h_cached')
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Quarantine fetch failed with cache available' }),
    )
    expect(store.error).toBeNull()
  })
})
