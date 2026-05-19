import { describe, it, expect, vi, beforeEach } from 'vitest'
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

import { api, ApiError } from '@/lib/api'

function mockSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'sig_1',
    arcId: 'arc_1',
    accountId: 'acc_1',
    status: 'quarantine_visible',
    source: 'ses',
    from: { address: 'sender@example.com', name: 'Sender' },
    to: [{ address: 'inbox@example.com' }],
    subject: 'Test subject',
    receivedAt: '2025-01-01T12:00:00Z',
    createdAt: '2025-01-01T12:00:00Z',
    matchedRules: [{ ruleId: 'rule_1', labels: ['system:sender:untrusted'], status: 'matched' }],
    ...overrides,
  }
}

function mockBothCalls(
  visItems: Signal[],
  hidItems: Signal[],
  visCursor?: string,
  hidCursor?: string,
) {
  vi.mocked(api.listQuarantinedSignals)
    .mockResolvedValueOnce(ok({ items: visItems, nextCursor: visCursor }))
    .mockResolvedValueOnce(ok({ items: hidItems, nextCursor: hidCursor }))
}

describe('quarantineStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = { id: 'acc_1', name: 'Test' } as Account
  })

  it('fetchSignals keeps visible and hidden in separate buckets, each sorted by receivedAt desc', async () => {
    const vis1 = mockSignal({ id: 'v1', receivedAt: '2025-01-01T10:00:00Z' })
    const vis2 = mockSignal({ id: 'v2', receivedAt: '2025-01-01T08:00:00Z' })
    const hid1 = mockSignal({ id: 'h1', status: 'quarantine_hidden', receivedAt: '2025-01-01T12:00:00Z' })
    mockBothCalls([vis2, vis1], [hid1])

    const store = useQuarantineStore()
    await store.fetchSignals(true)

    // visible-first ordering is maintained; each bucket sorted by receivedAt desc
    expect(store.quarantineVisible.map((s) => s.id)).toEqual(['v1', 'v2'])
    expect(store.quarantineHidden.map((s) => s.id)).toEqual(['h1'])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('fetchSignals sets error when visible call fails', async () => {
    vi.mocked(api.listQuarantinedSignals)
      .mockResolvedValueOnce(err(new ApiError(500, 'Server error')))
      .mockResolvedValueOnce(ok({ items: [] }))

    const store = useQuarantineStore()
    await store.fetchSignals(true)

    expect(store.quarantineVisible).toHaveLength(0)
    expect(store.quarantineHidden).toHaveLength(0)
    expect(store.error).toBe('Server error')
  })

  it('fetchSignals sets error when hidden call fails', async () => {
    vi.mocked(api.listQuarantinedSignals)
      .mockResolvedValueOnce(ok({ items: [] }))
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
    mockBothCalls([mockSignal({ id: 'v1' })], [mockSignal({ id: 'h1', status: 'quarantine_hidden' })], 'cur_v', 'cur_h')
    const store = useQuarantineStore()
    await store.fetchSignals(true)

    // fetchMore should request the visible cursor next
    vi.mocked(api.listQuarantinedSignals).mockResolvedValueOnce(
      ok({ items: [mockSignal({ id: 'v2' })], nextCursor: undefined }),
    )
    await store.fetchMore()

    expect(vi.mocked(api.listQuarantinedSignals)).toHaveBeenLastCalledWith(
      'acc_1',
      'quarantine_visible',
      expect.objectContaining({ cursor: 'cur_v' }),
    )
    expect(store.quarantineVisible.map((s) => s.id)).toContain('v2')
    // hidden cursor still pending
    expect(store.hasMore).toBe(true)
  })

  it('fetchMore loads hidden page once visible is exhausted', async () => {
    mockBothCalls([], [mockSignal({ id: 'h1', status: 'quarantine_hidden' })], undefined, 'cur_h')
    const store = useQuarantineStore()
    await store.fetchSignals(true)

    vi.mocked(api.listQuarantinedSignals).mockResolvedValueOnce(
      ok({ items: [mockSignal({ id: 'h2', status: 'quarantine_hidden' })], nextCursor: undefined }),
    )
    await store.fetchMore()

    expect(vi.mocked(api.listQuarantinedSignals)).toHaveBeenLastCalledWith(
      'acc_1',
      'quarantine_hidden',
      expect.objectContaining({ cursor: 'cur_h' }),
    )
    expect(store.quarantineHidden.map((s) => s.id)).toContain('h2')
    expect(store.hasMore).toBe(false)
  })

  it('allow removes signal from visible items on success', async () => {
    mockBothCalls([mockSignal({ id: 'sig_1' }), mockSignal({ id: 'sig_2' })], [])
    const store = useQuarantineStore()
    await store.fetchSignals(true)

    vi.mocked(api.quarantineResponse).mockResolvedValue(ok(mockSignal({ status: 'active' })))
    const result = await store.allow('sig_1')
    expect(result).toBe(true)
    expect(store.quarantineVisible.map((s) => s.id)).toEqual(['sig_2'])
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
    mockBothCalls([mockSignal({ id: 'sig_1' })], [])
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

  it('rejectForAlias calls addAliasSender and quarantineResponse then removes signal', async () => {
    mockBothCalls([mockSignal({ id: 'sig_1' })], [])
    const store = useQuarantineStore()
    await store.fetchSignals(true)

    vi.mocked(api.addAliasSender).mockResolvedValue(ok({} as never))
    vi.mocked(api.quarantineResponse).mockResolvedValue(ok(mockSignal({ status: 'block_hidden' })))
    const result = await store.rejectForAlias('sig_1', 'inbox@example.com', 'sender@example.com')
    expect(result).toBe(true)
    expect(store.quarantineVisible).toHaveLength(0)
    expect(vi.mocked(api.addAliasSender)).toHaveBeenCalledWith('acc_1', 'inbox@example.com', {
      domain: 'example.com',
      policy: 'block_hidden',
    })
    expect(vi.mocked(api.quarantineResponse)).toHaveBeenCalledWith('acc_1', 'sig_1', 'block_hidden')
  })

  it('rejectForAlias sets error and returns false when alias sender add fails', async () => {
    mockBothCalls([mockSignal()], [])
    const store = useQuarantineStore()
    await store.fetchSignals(true)

    vi.mocked(api.addAliasSender).mockResolvedValue(err(new ApiError(500, 'Alias error')))
    vi.mocked(api.quarantineResponse).mockResolvedValue(ok(mockSignal({ status: 'block_reject' })))
    const result = await store.rejectForAlias('sig_1', 'inbox@example.com', 'sender@example.com')
    expect(result).toBe(false)
    expect(store.error).toBe('Alias error')
    expect(store.quarantineVisible).toHaveLength(1)
  })

  it('rejectForAlias sets error and returns false when quarantineResponse fails', async () => {
    mockBothCalls([mockSignal()], [])
    const store = useQuarantineStore()
    await store.fetchSignals(true)

    vi.mocked(api.addAliasSender).mockResolvedValue(ok({} as never))
    vi.mocked(api.quarantineResponse).mockResolvedValue(err(new ApiError(500, 'Response error')))
    const result = await store.rejectForAlias('sig_1', 'inbox@example.com', 'sender@example.com')
    expect(result).toBe(false)
    expect(store.error).toBe('Response error')
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
