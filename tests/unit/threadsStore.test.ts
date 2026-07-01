import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { useThreadsStore } from '@/stores/threads'
import { useAccountStore } from '@/stores/account'
import type { Thread, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listThreads: vi.fn(),
      patchThread: vi.fn(),
      getThread: vi.fn(),
      unsubscribeThread: vi.fn(),
    },
  }
})

vi.mock('@/lib/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn(), critical: vi.fn(), track: vi.fn() },
}))

import { api, ApiError } from '@/lib/api'
import logger from '@/lib/logger'

function mockThread(overrides: Partial<Thread> = {}): Thread {
  return {
    threadId: 'thread_1',
    workflow: 'conversation',
    labels: [],
    status: 'active',
    summary: 'Test thread',
    lastSignalAt: '2025-01-01T12:00:00Z',
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-01T12:00:00Z',
    ...overrides,
  }
}

describe('threadsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  it('fetches threads and populates items', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [mockThread()], pagination: { cursor: null } }))
    const store = useThreadsStore()
    await store.fetchThreads(true)
    expect(store.items).toHaveLength(1)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('sets error when fetch fails', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(err(new ApiError(500, 'Server error')))
    const store = useThreadsStore()
    await store.fetchThreads(true)
    expect(store.items).toHaveLength(0)
    expect(store.error).toBe('Server error')
  })

  it('sortedItems orders threads by lastSignalAt descending', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(
      ok({
        threads: [
          mockThread({ threadId: 'thread_1', lastSignalAt: '2025-01-01T10:00:00Z' }),
          mockThread({ threadId: 'thread_2', lastSignalAt: '2025-01-03T10:00:00Z' }),
          mockThread({ threadId: 'thread_3', lastSignalAt: '2025-01-02T10:00:00Z' }),
        ],
        pagination: { cursor: null },
      }),
    )
    const store = useThreadsStore()
    await store.fetchThreads(true)
    expect(store.sortedItems.map((a) => a.threadId)).toEqual(['thread_2', 'thread_3', 'thread_1'])
  })

  it('toggleSelect adds and removes ids', () => {
    const store = useThreadsStore()
    store.toggleSelect('thread_1')
    expect(store.selectedIds.has('thread_1')).toBe(true)
    store.toggleSelect('thread_1')
    expect(store.selectedIds.has('thread_1')).toBe(false)
  })

  it('selectAll adds all item ids', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(
      ok({ threads: [mockThread({ threadId: 'thread_1' }), mockThread({ threadId: 'thread_2' })], pagination: { cursor: null } }),
    )
    const store = useThreadsStore()
    await store.fetchThreads(true)
    store.selectAll()
    expect(store.selectedIds.has('thread_1')).toBe(true)
    expect(store.selectedIds.has('thread_2')).toBe(true)
    expect(store.allSelected).toBe(true)
  })

  it('clearSelection empties selectedIds', () => {
    const store = useThreadsStore()
    store.toggleSelect('thread_1')
    store.clearSelection()
    expect(store.selectedIds.size).toBe(0)
  })

  it('bulkArchive optimistically removes active threads from list', async () => {
    vi.mocked(api.listThreads)
      .mockResolvedValueOnce(ok({ threads: [mockThread()], pagination: { cursor: null } }))
      .mockResolvedValue(ok({ threads: [], pagination: { cursor: null } }))
    vi.mocked(api.patchThread).mockResolvedValue(ok(mockThread({ status: 'archived' })))
    const store = useThreadsStore()
    await store.fetchThreads(true)
    store.toggleSelect('thread_1')
    await store.bulkArchive()
    expect(store.items).toHaveLength(0)
    expect(store.selectedIds.size).toBe(0)
  })

  it('hasMore is true when nextCursor is set', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [mockThread()], pagination: { cursor: 'cursor_abc' } }))
    const store = useThreadsStore()
    await store.fetchThreads(true)
    expect(store.hasMore).toBe(true)
  })

  it('archiveThread updates the cached thread status from the response', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [mockThread()], pagination: { cursor: null } }))
    vi.mocked(api.patchThread).mockResolvedValue(ok(mockThread({ status: 'archived' })))
    const store = useThreadsStore()
    await store.fetchThreads(true)
    store.setTab('all')
    await store.fetchThreads(true)
    await store.archiveThread('thread_1')
    // On the 'all' tab the thread stays visible but its status badge is now reactive.
    expect(store.items.find((a) => a.threadId === 'thread_1')?.status).toBe('archived')
  })

  it('archiveThread drops the thread from the active list reactively', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [mockThread()], pagination: { cursor: null } }))
    vi.mocked(api.patchThread).mockResolvedValue(ok(mockThread({ status: 'archived' })))
    const store = useThreadsStore()
    await store.fetchThreads(true)
    expect(store.activeCount).toBe(1)
    await store.archiveThread('thread_1')
    expect(store.items).toHaveLength(0)
    expect(store.activeCount).toBe(0)
  })

  it('moveToInbox flips status back to active', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [mockThread({ status: 'archived' })], pagination: { cursor: null } }))
    vi.mocked(api.patchThread).mockResolvedValue(ok(mockThread({ status: 'active' })))
    const store = useThreadsStore()
    store.setTab('archived')
    await store.fetchThreads(true)
    expect(store.items).toHaveLength(1)
    await store.moveToInbox('thread_1')
    // No longer matches the archived tab → reactively removed; now counts as active.
    expect(store.items).toHaveLength(0)
    expect(store.activeCount).toBe(1)
  })

  it('unsubscribeThread patches the cached status without a full thread in the response', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [mockThread()], pagination: { cursor: null } }))
    vi.mocked(api.unsubscribeThread).mockResolvedValue(ok({ status: 'archived', url: 'https://example.com' }))
    const store = useThreadsStore()
    store.setTab('all')
    await store.fetchThreads(true)
    await store.unsubscribeThread('thread_1')
    expect(store.items.find((a) => a.threadId === 'thread_1')?.status).toBe('archived')
  })
})

describe('stale-while-revalidate', { timeout: 5000 }, () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  it('fetchThreads with cached data does not show loading state', async () => {
    const store = useThreadsStore()
    // Populate cache via a successful fetch first (_byAccount is private)
    vi.mocked(api.listThreads).mockResolvedValueOnce(ok({ threads: [mockThread()], pagination: { cursor: null } }))
    await store.fetchThreads(true)

    vi.mocked(api.listThreads).mockResolvedValueOnce(ok({ threads: [mockThread()], pagination: { cursor: null } }))
    await store.fetchThreads(true)

    // loading should never have been true on second call — SWR skips loading when cache exists
    expect(store.loading).toBe(false)
  })

  it('fetchThreads replaces cached data with fresh API response', async () => {
    const store = useThreadsStore()
    // Populate cache via a successful fetch first
    vi.mocked(api.listThreads).mockResolvedValueOnce(ok({ threads: [mockThread({ threadId: 'thread_old' })], pagination: { cursor: null } }))
    await store.fetchThreads(true)

    const freshThread = mockThread({ threadId: 'thread_fresh', summary: 'Fresh from API' })
    vi.mocked(api.listThreads).mockResolvedValueOnce(ok({ threads: [freshThread], pagination: { cursor: null } }))
    await store.fetchThreads(true)

    expect(store.items).toHaveLength(1)
    expect(store.items[0].threadId).toBe('thread_fresh')
  })

  it('fetchThreads failure with cached data retains cache and logs warning', async () => {
    const store = useThreadsStore()
    // Populate cache via a successful fetch first (_byAccount is private)
    vi.mocked(api.listThreads).mockResolvedValueOnce(ok({ threads: [mockThread({ threadId: 'thread_cached' })], pagination: { cursor: null } }))
    await store.fetchThreads(true)
    expect(store.items).toHaveLength(1)

    vi.mocked(api.listThreads).mockResolvedValueOnce(err(new ApiError(500, 'Network timeout')))
    await store.fetchThreads(true)

    expect(store.items).toHaveLength(1)
    expect(store.items[0].threadId).toBe('thread_cached')
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Threads fetch failed with cache available' }),
    )
    expect(store.error).toBeNull()
  })
})
