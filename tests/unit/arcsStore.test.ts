import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { useArcsStore } from '@/stores/arcs'
import { useAccountStore } from '@/stores/account'
import type { Arc, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listArcs: vi.fn(),
      patchArc: vi.fn(),
      getArc: vi.fn(),
      unsubscribeArc: vi.fn(),
    },
  }
})

vi.mock('@/lib/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn(), critical: vi.fn(), track: vi.fn() },
}))

import { api, ApiError } from '@/lib/api'
import logger from '@/lib/logger'

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

describe('arcsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  it('fetches arcs and populates items', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(ok({ arcs: [mockArc()], pagination: { cursor: null } }))
    const store = useArcsStore()
    await store.fetchArcs(true)
    expect(store.items).toHaveLength(1)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('sets error when fetch fails', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(err(new ApiError(500, 'Server error')))
    const store = useArcsStore()
    await store.fetchArcs(true)
    expect(store.items).toHaveLength(0)
    expect(store.error).toBe('Server error')
  })

  it('sortedItems orders arcs by lastSignalAt descending', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(
      ok({
        arcs: [
          mockArc({ arcId: 'arc_1', lastSignalAt: '2025-01-01T10:00:00Z' }),
          mockArc({ arcId: 'arc_2', lastSignalAt: '2025-01-03T10:00:00Z' }),
          mockArc({ arcId: 'arc_3', lastSignalAt: '2025-01-02T10:00:00Z' }),
        ],
        pagination: { cursor: null },
      }),
    )
    const store = useArcsStore()
    await store.fetchArcs(true)
    expect(store.sortedItems.map((a) => a.arcId)).toEqual(['arc_2', 'arc_3', 'arc_1'])
  })

  it('toggleSelect adds and removes ids', () => {
    const store = useArcsStore()
    store.toggleSelect('arc_1')
    expect(store.selectedIds.has('arc_1')).toBe(true)
    store.toggleSelect('arc_1')
    expect(store.selectedIds.has('arc_1')).toBe(false)
  })

  it('selectAll adds all item ids', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(
      ok({ arcs: [mockArc({ arcId: 'arc_1' }), mockArc({ arcId: 'arc_2' })], pagination: { cursor: null } }),
    )
    const store = useArcsStore()
    await store.fetchArcs(true)
    store.selectAll()
    expect(store.selectedIds.has('arc_1')).toBe(true)
    expect(store.selectedIds.has('arc_2')).toBe(true)
    expect(store.allSelected).toBe(true)
  })

  it('clearSelection empties selectedIds', () => {
    const store = useArcsStore()
    store.toggleSelect('arc_1')
    store.clearSelection()
    expect(store.selectedIds.size).toBe(0)
  })

  it('bulkArchive optimistically removes active arcs from list', async () => {
    vi.mocked(api.listArcs)
      .mockResolvedValueOnce(ok({ arcs: [mockArc()], pagination: { cursor: null } }))
      .mockResolvedValue(ok({ arcs: [], pagination: { cursor: null } }))
    vi.mocked(api.patchArc).mockResolvedValue(ok(mockArc({ status: 'archived' })))
    const store = useArcsStore()
    await store.fetchArcs(true)
    store.toggleSelect('arc_1')
    await store.bulkArchive()
    expect(store.items).toHaveLength(0)
    expect(store.selectedIds.size).toBe(0)
  })

  it('hasMore is true when nextCursor is set', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(ok({ arcs: [mockArc()], pagination: { cursor: 'cursor_abc' } }))
    const store = useArcsStore()
    await store.fetchArcs(true)
    expect(store.hasMore).toBe(true)
  })

  it('archiveArc updates the cached arc status from the response', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(ok({ arcs: [mockArc()], pagination: { cursor: null } }))
    vi.mocked(api.patchArc).mockResolvedValue(ok(mockArc({ status: 'archived' })))
    const store = useArcsStore()
    await store.fetchArcs(true)
    store.setTab('all')
    await store.fetchArcs(true)
    await store.archiveArc('arc_1')
    // On the 'all' tab the arc stays visible but its status badge is now reactive.
    expect(store.items.find((a) => a.arcId === 'arc_1')?.status).toBe('archived')
  })

  it('archiveArc drops the arc from the active list reactively', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(ok({ arcs: [mockArc()], pagination: { cursor: null } }))
    vi.mocked(api.patchArc).mockResolvedValue(ok(mockArc({ status: 'archived' })))
    const store = useArcsStore()
    await store.fetchArcs(true)
    expect(store.activeCount).toBe(1)
    await store.archiveArc('arc_1')
    expect(store.items).toHaveLength(0)
    expect(store.activeCount).toBe(0)
  })

  it('moveToInbox flips status back to active', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(ok({ arcs: [mockArc({ status: 'archived' })], pagination: { cursor: null } }))
    vi.mocked(api.patchArc).mockResolvedValue(ok(mockArc({ status: 'active' })))
    const store = useArcsStore()
    store.setTab('archived')
    await store.fetchArcs(true)
    expect(store.items).toHaveLength(1)
    await store.moveToInbox('arc_1')
    // No longer matches the archived tab → reactively removed; now counts as active.
    expect(store.items).toHaveLength(0)
    expect(store.activeCount).toBe(1)
  })

  it('unsubscribeArc patches the cached status without a full arc in the response', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(ok({ arcs: [mockArc()], pagination: { cursor: null } }))
    vi.mocked(api.unsubscribeArc).mockResolvedValue(ok({ status: 'archived', url: 'https://example.com' }))
    const store = useArcsStore()
    store.setTab('all')
    await store.fetchArcs(true)
    await store.unsubscribeArc('arc_1')
    expect(store.items.find((a) => a.arcId === 'arc_1')?.status).toBe('archived')
  })
})

describe('stale-while-revalidate', { timeout: 5000 }, () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  it('fetchArcs with cached data does not show loading state', async () => {
    const store = useArcsStore()
    // Populate cache via a successful fetch first (_byAccount is private)
    vi.mocked(api.listArcs).mockResolvedValueOnce(ok({ arcs: [mockArc()], pagination: { cursor: null } }))
    await store.fetchArcs(true)

    vi.mocked(api.listArcs).mockResolvedValueOnce(ok({ arcs: [mockArc()], pagination: { cursor: null } }))
    await store.fetchArcs(true)

    // loading should never have been true on second call — SWR skips loading when cache exists
    expect(store.loading).toBe(false)
  })

  it('fetchArcs replaces cached data with fresh API response', async () => {
    const store = useArcsStore()
    // Populate cache via a successful fetch first
    vi.mocked(api.listArcs).mockResolvedValueOnce(ok({ arcs: [mockArc({ arcId: 'arc_old' })], pagination: { cursor: null } }))
    await store.fetchArcs(true)

    const freshArc = mockArc({ arcId: 'arc_fresh', summary: 'Fresh from API' })
    vi.mocked(api.listArcs).mockResolvedValueOnce(ok({ arcs: [freshArc], pagination: { cursor: null } }))
    await store.fetchArcs(true)

    expect(store.items).toHaveLength(1)
    expect(store.items[0].arcId).toBe('arc_fresh')
  })

  it('fetchArcs failure with cached data retains cache and logs warning', async () => {
    const store = useArcsStore()
    // Populate cache via a successful fetch first (_byAccount is private)
    vi.mocked(api.listArcs).mockResolvedValueOnce(ok({ arcs: [mockArc({ arcId: 'arc_cached' })], pagination: { cursor: null } }))
    await store.fetchArcs(true)
    expect(store.items).toHaveLength(1)

    vi.mocked(api.listArcs).mockResolvedValueOnce(err(new ApiError(500, 'Network timeout')))
    await store.fetchArcs(true)

    expect(store.items).toHaveLength(1)
    expect(store.items[0].arcId).toBe('arc_cached')
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Arcs fetch failed with cache available' }),
    )
    expect(store.error).toBeNull()
  })
})
