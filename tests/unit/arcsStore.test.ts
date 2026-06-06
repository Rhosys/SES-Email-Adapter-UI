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

  it('pins auth+critical arcs first in sortedItems', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(
      ok({
        arcs: [
          mockArc({ arcId: 'arc_2', workflow: 'conversation', urgency: 'high' }),
          mockArc({ arcId: 'arc_1', workflow: 'auth', urgency: 'critical' }),
        ],
        pagination: { cursor: null },
      }),
    )
    const store = useArcsStore()
    await store.fetchArcs(true)
    expect(store.sortedItems[0].arcId).toBe('arc_1')
    expect(store.sortedItems[1].arcId).toBe('arc_2')
  })

  it('does not pin auth arcs that are not critical', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(
      ok({
        arcs: [
          mockArc({ arcId: 'arc_2', workflow: 'conversation', urgency: 'high' }),
          mockArc({ arcId: 'arc_1', workflow: 'auth', urgency: 'normal' }),
        ],
        pagination: { cursor: null },
      }),
    )
    const store = useArcsStore()
    await store.fetchArcs(true)
    // auth without critical urgency is not pinned — original order preserved
    expect(store.sortedItems[0].arcId).toBe('arc_2')
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
})
