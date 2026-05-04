import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { useArcsStore } from '@/stores/arcs'
import type { Arc } from '@/types/server'

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
    id: 'arc_1',
    accountId: 'acc_1',
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
  })

  it('fetches arcs and populates items', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(ok({ items: [mockArc()], total: 1 }))
    const store = useArcsStore()
    await store.fetchArcs('acc_1', true)
    expect(store.items).toHaveLength(1)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('sets error when fetch fails', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(err(new ApiError(500, 'Server error')))
    const store = useArcsStore()
    await store.fetchArcs('acc_1', true)
    expect(store.items).toHaveLength(0)
    expect(store.error).toBe('Server error')
  })

  it('pins auth+critical arcs first in sortedItems', () => {
    const store = useArcsStore()
    store.items = [
      mockArc({ id: 'arc_2', workflow: 'conversation', urgency: 'high' }),
      mockArc({ id: 'arc_1', workflow: 'auth', urgency: 'critical' }),
    ]
    expect(store.sortedItems[0].id).toBe('arc_1')
    expect(store.sortedItems[1].id).toBe('arc_2')
  })

  it('does not pin auth arcs that are not critical', () => {
    const store = useArcsStore()
    store.items = [
      mockArc({ id: 'arc_2', workflow: 'conversation', urgency: 'high' }),
      mockArc({ id: 'arc_1', workflow: 'auth', urgency: 'normal' }),
    ]
    // auth without critical urgency is not pinned — original order preserved
    expect(store.sortedItems[0].id).toBe('arc_2')
  })

  it('toggleSelect adds and removes ids', () => {
    const store = useArcsStore()
    store.toggleSelect('arc_1')
    expect(store.selectedIds.has('arc_1')).toBe(true)
    store.toggleSelect('arc_1')
    expect(store.selectedIds.has('arc_1')).toBe(false)
  })

  it('selectAll adds all item ids', () => {
    const store = useArcsStore()
    store.items = [mockArc({ id: 'arc_1' }), mockArc({ id: 'arc_2' })]
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
    vi.mocked(api.patchArc).mockResolvedValue(ok(mockArc({ status: 'archived' })))
    vi.mocked(api.listArcs).mockResolvedValue(ok({ items: [], total: 0 }))
    const store = useArcsStore()
    store.items = [mockArc()]
    store.toggleSelect('arc_1')
    await store.bulkArchive('acc_1')
    expect(store.items).toHaveLength(0)
    expect(store.selectedIds.size).toBe(0)
  })

  it('hasMore is true when nextCursor is set', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(
      ok({ items: [mockArc()], total: 10, nextCursor: 'cursor_abc' }),
    )
    const store = useArcsStore()
    await store.fetchArcs('acc_1', true)
    expect(store.hasMore).toBe(true)
  })
})
