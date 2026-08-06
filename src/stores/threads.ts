import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ok, err, type Result } from 'neverthrow'
import { api, ApiError } from '@/lib/api'
import logger from '@/lib/logger'
import { useAccountStore } from '@/stores/account'
import { NoCurrentAccountError } from '@/stores/errors'
import type { Thread, ThreadStatus } from '@/types/server'

const PAGE_SIZE = 50

export interface FetchThreadsOptions {
  /** Listing to load. Omit for every status (the "All" listing). */
  status?: ThreadStatus
  /** Cursor from a previous `fetchThreads` call. Omit to (re)load the first page. */
  cursor?: string
  /** Ask the server to bypass its cache — the inbox's manual refresh button. */
  refresh?: boolean
}

export const useThreadsStore = defineStore('threads', () => {
  const accountStore = useAccountStore()

  // The store's whole job: every thread it has loaded, keyed by account. Which of them
  // a given screen shows, and how far that screen has paginated, is the screen's business.
  const _byAccount = ref<Record<string, Thread[]>>({})
  // Whether the active listing has pages beyond what's loaded, so the badge can render
  // "50+" instead of a confidently wrong "50". A property of the loaded list, not a cursor.
  const _moreActive = ref<Record<string, boolean>>({})
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const selectedIds = ref(new Set<string>())
  const bulkActionPending = ref(false)

  /**
   * Every loaded thread for the current account. Threads with no signals are dropped —
   * a null lastSignalAt means there is nothing left to show (e.g. the thread's only
   * signal was reprocessed onto another thread).
   */
  const threads = computed<Thread[]>(() => {
    const id = accountStore.accountId
    if (!id) return []
    const all = _byAccount.value[id]
    if (!Array.isArray(all)) return []
    return all.filter((a) => a.lastSignalAt != null)
  })

  function byLastSignalDesc(a: Thread, b: Thread) {
    return new Date(b.lastSignalAt ?? 0).getTime() - new Date(a.lastSignalAt ?? 0).getTime()
  }

  const sortedThreads = computed<Thread[]>(() => [...threads.value].sort(byLastSignalDesc))

  /** Newest-first threads with the given status — what each inbox tab renders. */
  function threadsWithStatus(status: ThreadStatus): Thread[] {
    return sortedThreads.value.filter((a) => a.status === status)
  }

  const activeThreads = computed<Thread[]>(() => sortedThreads.value.filter((a) => a.status === 'active'))

  // Notification badges are plain derivations of what's loaded. Nothing recomputes or
  // refetches them: mutations write through the cache below and every badge follows.
  const activeCount = computed(() => activeThreads.value.length)

  const activeCountHasMore = computed(() => {
    const id = accountStore.accountId
    return id ? _moreActive.value[id] === true : false
  })

  // ─── Cache mutation helpers ───────────────────────────────────────────────
  // All writes funnel through these so the store stays the single source of
  // truth and every reactive consumer (lists, counts, badges) updates together.

  function _writeThreads(id: string, threads: Thread[]) {
    _byAccount.value = { ..._byAccount.value, [id]: threads }
  }

  /**
   * Merge a full thread object into the cache — used for responses that return the
   * complete resource (GET/POST/PUT and PATCH responses that echo the thread).
   * Replaces the existing entry or prepends a new one.
   */
  function _upsertThread(thread: Thread) {
    const id = accountStore.accountId
    if (!id) return
    const existing = _byAccount.value[id] ?? []
    const idx = existing.findIndex((a) => a.threadId === thread.threadId)
    _writeThreads(id, idx >= 0 ? existing.map((a) => (a.threadId === thread.threadId ? thread : a)) : [thread, ...existing])
  }

  /**
   * Merge partial fields into a cached thread — used for optimistic updates and for
   * responses that don't carry a full thread object (e.g. the unsubscribe endpoint).
   * No-op when the thread isn't cached.
   */
  function _patchThreadLocal(threadId: string, partial: Partial<Thread>) {
    const id = accountStore.accountId
    if (!id) return
    const existing = _byAccount.value[id] ?? []
    if (!existing.some((a) => a.threadId === threadId)) return
    _writeThreads(id, existing.map((a) => (a.threadId === threadId ? { ...a, ...partial } : a)))
  }

  /**
   * Fold a fetched page into the cache. One cache serves every listing, so a page must
   * only ever displace threads the request actually spoke for: reloading the first page
   * of one status replaces that status's threads and leaves the rest alone. Anything
   * else lets one screen's fetch silently empty another's list — and the badge counts
   * with it.
   */
  function _mergePage(id: string, page: Thread[], status: ThreadStatus | undefined, isFirstPage: boolean) {
    const fetchedIds = new Set(page.map((t) => t.threadId))
    const retained = (_byAccount.value[id] ?? []).filter((t) => {
      if (fetchedIds.has(t.threadId)) return false
      if (!isFirstPage) return true
      return status !== undefined && t.status !== status
    })
    _writeThreads(id, [...retained, ...page])
  }

  /**
   * Load one page of threads into the cache and return the cursor for the page after it
   * (undefined when the listing is exhausted). The caller holds that cursor: it is the
   * one that knows which listing the user is looking at and when they ask for more.
   */
  async function fetchThreads(options: FetchThreadsOptions = {}): Promise<string | undefined> {
    const { status, cursor, refresh } = options
    const id = accountStore.accountId
    if (!id) return undefined
    const isFirstPage = cursor === undefined
    if (isFirstPage) loading.value = true
    else loadingMore.value = true
    error.value = null
    const result = await api.listThreads(id, {
      status,
      cursor,
      limit: PAGE_SIZE,
      refresh: refresh ? new Date().toISOString() : undefined,
    })
    loading.value = false
    loadingMore.value = false
    if (result.isErr()) {
      if ((_byAccount.value[id] ?? []).length > 0) {
        logger.warn({ title: 'Threads fetch failed with cache available', error: result.error.message })
      } else {
        error.value = result.error.message
      }
      return undefined
    }
    const page = result.value
    const next = page.pagination.cursor ?? undefined
    _mergePage(id, page.threads, status, isFirstPage)
    // The "All" listing covers active threads too, so both settle the badge's "+".
    if (status === 'active' || status === undefined) {
      _moreActive.value = { ..._moreActive.value, [id]: next !== undefined }
    }
    return next
  }

  function toggleSelect(id: string) {
    if (selectedIds.value.has(id)) {
      selectedIds.value.delete(id)
    } else {
      selectedIds.value.add(id)
    }
  }

  function selectAll(threadIds: string[]) {
    threadIds.forEach((id) => selectedIds.value.add(id))
  }

  function clearSelection() {
    selectedIds.value.clear()
  }

  async function _bulkStatus(status: ThreadStatus, verb: string) {
    const id = accountStore.accountId
    if (!id) return
    const ids = [...selectedIds.value]
    // Optimistic: flip status in the cache so the status-filtered lists drop them immediately.
    ids.forEach((threadId) => _patchThreadLocal(threadId, { status }))
    clearSelection()
    bulkActionPending.value = true
    const results = await Promise.all(ids.map((threadId) => api.patchThread(id, threadId, { status })))
    bulkActionPending.value = false
    // Reconcile with the full thread each response returns.
    results.forEach((r) => r.map((thread) => _upsertThread(thread)))
    const failed = results.filter((r) => r.isErr())
    if (failed.length > 0) {
      error.value = `Failed to ${verb} ${failed.length} thread(s)`
      // Re-read the threads we just tried to move so the cache stops lying about them.
      await Promise.all(ids.map((threadId) => refreshThread(threadId)))
    }
  }

  async function bulkArchive() {
    await _bulkStatus('archived', 'archive')
  }

  async function bulkMoveToInbox() {
    await _bulkStatus('active', 'move to inbox')
  }

  async function bulkDelete() {
    await _bulkStatus('deleted', 'delete')
  }

  async function bulkLabel(label: string) {
    const id = accountStore.accountId
    if (!id) return
    const ids = [...selectedIds.value]
    bulkActionPending.value = true
    const results = await Promise.all(
      ids.map((threadId) => {
        const thread = threads.value.find((a) => a.threadId === threadId)
        const labels = thread ? [...new Set([...thread.labels, label])] : [label]
        return api.patchThread(id, threadId, { labels })
      }),
    )
    bulkActionPending.value = false
    // Apply each response (carries server-normalized labels) back to the cache.
    results.forEach((r) => r.map((thread) => _upsertThread(thread)))
    const failed = results.filter((r) => r.isErr())
    if (failed.length > 0) {
      error.value = `Failed to label ${failed.length} thread(s)`
    }
  }

  async function refreshThread(threadId: string) {
    const id = accountStore.accountId
    if (!id) return
    const result = await api.getThread(id, threadId)
    if (result.isErr()) {
      if (result.error.status === 404) removeThread(threadId)
      return
    }
    _upsertThread(result.value)
  }

  function getThread(threadId: string): Thread | undefined {
    const id = accountStore.accountId
    if (!id) return undefined
    const existing = (_byAccount.value[id] ?? []).find((a) => a.threadId === threadId)
    // Fire background refresh regardless of cache hit
    void refreshThread(threadId)
    return existing
  }

  async function getThreadAsync(threadId: string): Promise<Thread | undefined> {
    const id = accountStore.accountId
    if (!id) return undefined
    const existing = (_byAccount.value[id] ?? []).find((a) => a.threadId === threadId)
    if (existing) return existing
    // Not cached — fetch and insert
    const result = await api.getThread(id, threadId)
    if (result.isErr()) {
      if (result.error.status === 404) removeThread(threadId)
      return undefined
    }
    _upsertThread(result.value)
    return result.value
  }

  function removeThread(id: string) {
    const accId = accountStore.accountId
    if (!accId || !_byAccount.value[accId]) return
    _byAccount.value = {
      ..._byAccount.value,
      [accId]: (_byAccount.value[accId] ?? []).filter((a) => a.threadId !== id),
    }
  }

  /**
   * Change a thread's status. The PATCH response echoes the full thread, so the
   * cache is updated from the response; every status-filtered list and badge
   * follows from that one write.
   */
  async function setStatus(
    threadId: string,
    status: ThreadStatus,
  ): Promise<Result<Thread, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    const result = await api.patchThread(id, threadId, { status })
    if (result.isErr()) return err(result.error)
    _upsertThread(result.value)
    return ok(result.value)
  }

  function archiveThread(threadId: string) {
    return setStatus(threadId, 'archived')
  }

  function moveToInbox(threadId: string) {
    return setStatus(threadId, 'active')
  }

  function deleteThread(threadId: string) {
    return setStatus(threadId, 'deleted')
  }

  async function labelThread(threadId: string, labels: string[]): Promise<Result<Thread, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    const result = await api.patchThread(id, threadId, { labels })
    if (result.isErr()) return err(result.error)
    _upsertThread(result.value)
    return ok(result.value)
  }

  async function unsubscribeThread(threadId: string): Promise<Result<{ status: string; url?: string }, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    const result = await api.unsubscribeThread(id, threadId)
    if (result.isErr()) return err(result.error)
    // The unsubscribe response carries no thread object; it archives the thread
    // server-side, so patch the cached status directly on success.
    _patchThreadLocal(threadId, { status: 'archived' })
    return ok(result.value)
  }

  return {
    threads,
    sortedThreads,
    activeThreads,
    threadsWithStatus,
    activeCount,
    activeCountHasMore,
    loading,
    loadingMore,
    error,
    selectedIds,
    bulkActionPending,
    fetchThreads,
    refreshThread,
    toggleSelect,
    selectAll,
    clearSelection,
    bulkArchive,
    bulkMoveToInbox,
    bulkDelete,
    bulkLabel,
    setStatus,
    archiveThread,
    moveToInbox,
    deleteThread,
    labelThread,
    unsubscribeThread,
    removeThread,
    getThread,
    getThreadAsync,
  }
}, {
  persist: {
    accountKeyedRef: '_byAccount',
    filter: (items) => (items as Thread[]).filter((a) => a.status === 'active'),
  },
})
