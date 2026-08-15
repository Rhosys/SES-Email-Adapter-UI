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
    sender: { address: 'sender@example.com' },
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

  it('fetches threads and populates the cache', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [mockThread()], pagination: { cursor: null } }))
    const store = useThreadsStore()
    await store.fetchThreads({ status: 'active' })
    expect(store.threads).toHaveLength(1)
    expect(store.error).toBeNull()
  })

  it('sets error when fetch fails', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(err(new ApiError(500, 'Server error')))
    const store = useThreadsStore()
    await store.fetchThreads({ status: 'active' })
    expect(store.threads).toHaveLength(0)
    expect(store.error).toBe('Server error')
  })

  it('hides threads with a null lastSignalAt (no signals left)', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(
      ok({
        threads: [
          mockThread({ threadId: 'thread_1', lastSignalAt: '2025-01-01T12:00:00Z' }),
          mockThread({ threadId: 'thread_empty', lastSignalAt: null }),
        ],
        pagination: { cursor: null },
      }),
    )
    const store = useThreadsStore()
    await store.fetchThreads({ status: 'active' })
    expect(store.threads.map((a) => a.threadId)).toEqual(['thread_1'])
    expect(store.activeCount).toBe(1)
  })

  it('sortedThreads orders threads by lastSignalAt descending', async () => {
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
    await store.fetchThreads({ status: 'active' })
    expect(store.sortedThreads.map((a) => a.threadId)).toEqual(['thread_2', 'thread_3', 'thread_1'])
  })

  it('threadsWithStatus splits the cache by status', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(
      ok({
        threads: [mockThread({ threadId: 'thread_1' }), mockThread({ threadId: 'thread_old', status: 'archived' })],
        pagination: { cursor: null },
      }),
    )
    const store = useThreadsStore()
    await store.fetchThreads()
    expect(store.threadsWithStatus('active').map((a) => a.threadId)).toEqual(['thread_1'])
    expect(store.threadsWithStatus('archived').map((a) => a.threadId)).toEqual(['thread_old'])
  })

  it('returns the next cursor to the caller instead of storing it', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [mockThread()], pagination: { cursor: 'cursor_abc' } }))
    const store = useThreadsStore()
    expect(await store.fetchThreads({ status: 'active' })).toBe('cursor_abc')

    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [], pagination: { cursor: null } }))
    expect(await store.fetchThreads({ status: 'active', cursor: 'cursor_abc' })).toBeUndefined()
  })

  it('a later page adds to the listing rather than replacing it', async () => {
    vi.mocked(api.listThreads).mockResolvedValueOnce(
      ok({ threads: [mockThread({ threadId: 'thread_1' })], pagination: { cursor: 'cursor_abc' } }),
    )
    const store = useThreadsStore()
    const cursor = await store.fetchThreads({ status: 'active' })

    vi.mocked(api.listThreads).mockResolvedValueOnce(
      ok({ threads: [mockThread({ threadId: 'thread_2' })], pagination: { cursor: null } }),
    )
    await store.fetchThreads({ status: 'active', cursor })

    expect(store.activeCount).toBe(2)
    expect(vi.mocked(api.listThreads).mock.calls[1][1]).toMatchObject({ cursor: 'cursor_abc', status: 'active' })
  })

  it('toggleSelect adds and removes ids', () => {
    const store = useThreadsStore()
    store.toggleSelect('thread_1')
    expect(store.selectedIds.has('thread_1')).toBe(true)
    store.toggleSelect('thread_1')
    expect(store.selectedIds.has('thread_1')).toBe(false)
  })

  it('selectAll selects the ids it is given', () => {
    const store = useThreadsStore()
    store.selectAll(['thread_1', 'thread_2'])
    expect(store.selectedIds.has('thread_1')).toBe(true)
    expect(store.selectedIds.has('thread_2')).toBe(true)
  })

  it('clearSelection empties selectedIds', () => {
    const store = useThreadsStore()
    store.toggleSelect('thread_1')
    store.clearSelection()
    expect(store.selectedIds.size).toBe(0)
  })

  it('bulkArchive optimistically drops threads out of the active listing', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [mockThread()], pagination: { cursor: null } }))
    vi.mocked(api.patchThread).mockResolvedValue(ok(mockThread({ status: 'archived' })))
    const store = useThreadsStore()
    await store.fetchThreads({ status: 'active' })
    store.toggleSelect('thread_1')
    await store.bulkArchive()
    expect(store.threadsWithStatus('active')).toHaveLength(0)
    expect(store.selectedIds.size).toBe(0)
  })

  it('archiveThread updates the cached thread status from the response', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [mockThread()], pagination: { cursor: null } }))
    vi.mocked(api.patchThread).mockResolvedValue(ok(mockThread({ status: 'archived' })))
    const store = useThreadsStore()
    await store.fetchThreads({ status: 'active' })
    await store.archiveThread('thread_1')
    // Still cached — the "All" tab shows it — but no longer part of the active listing.
    expect(store.threads.find((a) => a.threadId === 'thread_1')?.status).toBe('archived')
    expect(store.threadsWithStatus('active')).toHaveLength(0)
    expect(store.activeCount).toBe(0)
  })

  it('moveToInbox flips status back to active', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [mockThread({ status: 'archived' })], pagination: { cursor: null } }))
    vi.mocked(api.patchThread).mockResolvedValue(ok(mockThread({ status: 'active' })))
    const store = useThreadsStore()
    await store.fetchThreads({ status: 'archived' })
    expect(store.threadsWithStatus('archived')).toHaveLength(1)
    await store.moveToInbox('thread_1')
    expect(store.threadsWithStatus('archived')).toHaveLength(0)
    expect(store.activeCount).toBe(1)
  })

  it('snoozeThread updates the cached status and followupAt from the response', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [mockThread()], pagination: { cursor: null } }))
    vi.mocked(api.patchThread).mockResolvedValue(ok(mockThread({ status: 'archived', followupAt: '2099-01-01T09:00:00.000Z' })))
    const store = useThreadsStore()
    await store.fetchThreads({ status: 'active' })
    await store.snoozeThread('thread_1', '2099-01-01T09:00:00.000Z')
    expect(store.threads.find((a) => a.threadId === 'thread_1')?.status).toBe('archived')
    expect(store.threadsWithStatus('active')).toHaveLength(0)
  })

  it('snoozeThread leaves the cached thread untouched when the request fails (no stale optimistic patch)', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [mockThread()], pagination: { cursor: null } }))
    vi.mocked(api.patchThread).mockResolvedValue(err(new ApiError(400, 'Invalid request body')))
    const store = useThreadsStore()
    await store.fetchThreads({ status: 'active' })
    const result = await store.snoozeThread('thread_1', '2099-01-01T09:00:00.000+02:00')
    expect(result.isErr()).toBe(true)
    // A rejected request must not leave the thread looking archived in the cache —
    // that's exactly what made a failed snooze look like it "worked" until refresh.
    expect(store.threads.find((a) => a.threadId === 'thread_1')?.status).toBe('active')
    expect(store.threadsWithStatus('active')).toHaveLength(1)
  })

  it('unsubscribeThread patches the cached status without a full thread in the response', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [mockThread()], pagination: { cursor: null } }))
    vi.mocked(api.unsubscribeThread).mockResolvedValue(ok({ status: 'archived', url: 'https://example.com' }))
    const store = useThreadsStore()
    await store.fetchThreads({ status: 'active' })
    await store.unsubscribeThread('thread_1')
    expect(store.threads.find((a) => a.threadId === 'thread_1')?.status).toBe('archived')
  })
})

describe('badge counts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  it('survives loading another listing', async () => {
    vi.mocked(api.listThreads).mockResolvedValueOnce(
      ok({
        threads: [mockThread({ threadId: 'thread_1' }), mockThread({ threadId: 'thread_2' })],
        pagination: { cursor: null },
      }),
    )
    const store = useThreadsStore()
    await store.fetchThreads({ status: 'active' })
    expect(store.activeCount).toBe(2)

    // Opening the Archived tab loads a different listing into the same cache.
    vi.mocked(api.listThreads).mockResolvedValueOnce(
      ok({ threads: [mockThread({ threadId: 'thread_old', status: 'archived' })], pagination: { cursor: null } }),
    )
    await store.fetchThreads({ status: 'archived' })

    expect(store.threadsWithStatus('archived').map((a) => a.threadId)).toEqual(['thread_old'])
    expect(store.activeCount).toBe(2)
  })

  it('ignores pagination belonging to another listing', async () => {
    vi.mocked(api.listThreads).mockResolvedValueOnce(ok({ threads: [mockThread()], pagination: { cursor: null } }))
    const store = useThreadsStore()
    await store.fetchThreads({ status: 'active' })
    expect(store.activeCountHasMore).toBe(false)

    // More archived pages exist, but every active thread is already accounted for.
    vi.mocked(api.listThreads).mockResolvedValueOnce(
      ok({ threads: [mockThread({ threadId: 'thread_old', status: 'archived' })], pagination: { cursor: 'cursor_abc' } }),
    )
    await store.fetchThreads({ status: 'archived' })
    expect(store.activeCountHasMore).toBe(false)
  })

  it('marks the active count as partial while pages remain', async () => {
    vi.mocked(api.listThreads).mockResolvedValueOnce(ok({ threads: [mockThread()], pagination: { cursor: 'cursor_abc' } }))
    const store = useThreadsStore()
    const cursor = await store.fetchThreads({ status: 'active' })
    expect(store.activeCountHasMore).toBe(true)

    vi.mocked(api.listThreads).mockResolvedValueOnce(
      ok({ threads: [mockThread({ threadId: 'thread_2' })], pagination: { cursor: null } }),
    )
    await store.fetchThreads({ status: 'active', cursor })
    expect(store.activeCount).toBe(2)
    expect(store.activeCountHasMore).toBe(false)
  })

  it('survives the mixed "All" listing, which speaks for no listing in full', async () => {
    vi.mocked(api.listThreads).mockResolvedValueOnce(
      ok({
        threads: [mockThread({ threadId: 'act_1' }), mockThread({ threadId: 'act_2' }), mockThread({ threadId: 'act_3' })],
        pagination: { cursor: null },
      }),
    )
    const store = useThreadsStore()
    await store.fetchThreads({ status: 'active' })
    expect(store.activeCount).toBe(3)

    // The All tab's first page is a mix, and doesn't have room for every active thread.
    vi.mocked(api.listThreads).mockResolvedValueOnce(
      ok({
        threads: [mockThread({ threadId: 'act_1' }), mockThread({ threadId: 'arch_1', status: 'archived' })],
        pagination: { cursor: 'cursor_abc' },
      }),
    )
    await store.fetchThreads()

    expect(store.activeCount).toBe(3)
    expect(store.threadsWithStatus('archived').map((a) => a.threadId)).toEqual(['arch_1'])
  })

  it('drops active threads the server no longer returns', async () => {
    vi.mocked(api.listThreads).mockResolvedValueOnce(
      ok({
        threads: [mockThread({ threadId: 'thread_1' }), mockThread({ threadId: 'thread_2' })],
        pagination: { cursor: null },
      }),
    )
    const store = useThreadsStore()
    await store.fetchThreads({ status: 'active' })

    // thread_2 was archived from another device — reloading the listing must not keep it.
    vi.mocked(api.listThreads).mockResolvedValueOnce(
      ok({ threads: [mockThread({ threadId: 'thread_1' })], pagination: { cursor: null } }),
    )
    await store.fetchThreads({ status: 'active' })
    expect(store.activeCount).toBe(1)
  })
})

describe('stale-while-revalidate', { timeout: 5000 }, () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  it('fetchThreads replaces cached data with fresh API response', async () => {
    const store = useThreadsStore()
    // Populate cache via a successful fetch first
    vi.mocked(api.listThreads).mockResolvedValueOnce(ok({ threads: [mockThread({ threadId: 'thread_old' })], pagination: { cursor: null } }))
    await store.fetchThreads({ status: 'active' })

    const freshThread = mockThread({ threadId: 'thread_fresh', summary: 'Fresh from API' })
    vi.mocked(api.listThreads).mockResolvedValueOnce(ok({ threads: [freshThread], pagination: { cursor: null } }))
    await store.fetchThreads({ status: 'active' })

    expect(store.threads).toHaveLength(1)
    expect(store.threads[0].threadId).toBe('thread_fresh')
  })

  it('fetchThreads failure with cached data retains cache and logs warning', async () => {
    const store = useThreadsStore()
    // Populate cache via a successful fetch first (_byAccount is private)
    vi.mocked(api.listThreads).mockResolvedValueOnce(ok({ threads: [mockThread({ threadId: 'thread_cached' })], pagination: { cursor: null } }))
    await store.fetchThreads({ status: 'active' })
    expect(store.threads).toHaveLength(1)

    vi.mocked(api.listThreads).mockResolvedValueOnce(err(new ApiError(500, 'Network timeout')))
    await store.fetchThreads({ status: 'active' })

    expect(store.threads).toHaveLength(1)
    expect(store.threads[0].threadId).toBe('thread_cached')
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Threads fetch failed with cache available' }),
    )
    expect(store.error).toBeNull()
  })
})
