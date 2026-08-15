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
  // The active listing's next-page cursor, per account. Set means there are active threads
  // beyond the ones loaded, so the badge reads "50+" rather than a confidently wrong "50".
  // Startup always loads the first page of active threads, so this is always answered.
  const _activeCursor = ref<Record<string, string | undefined>>({})
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const selectedIds = ref(new Set<string>())
  const bulkActionPending = ref(false)

  // Threads with no meaningful lastSignalAt (null or ancient sentinel values like
  // the Unix epoch) have nothing to show. Filter them once so all downstream
  // computeds (sortedThreads, activeThreads, badges) share a consistent base.
  const _signalCutoff = "2000-01-01T00:00:00.000Z"
  const threads = computed<Thread[]>(() => {
    const id = accountStore.accountId
    if (!id) return []
    const all = _byAccount.value[id]
    if (!Array.isArray(all)) return []
    return all.filter((a) => a.lastSignalAt != null && a.lastSignalAt > _signalCutoff)
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
    return id ? _activeCursor.value[id] !== undefined : false
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

  /** The cached threads a page doesn't carry a newer copy of. */
  function _notIn(page: Thread[], cached: Thread[]) {
    const pageIds = new Set(page.map((t) => t.threadId))
    return cached.filter((t) => !pageIds.has(t.threadId))
  }

  /**
   * Take a page's threads as the current contents of one listing, dropping the threads
   * that listing held before — this is how threads archived on another device stop
   * being counted. One cache serves every listing, so it only displaces threads the
   * request spoke for: reloading `status=archived` says nothing about active threads,
   * and they stay.
   */
  function _replaceListing(id: string, status: ThreadStatus, page: Thread[]) {
    const otherListings = (_byAccount.value[id] ?? []).filter((t) => t.status !== status)
    _writeThreads(id, [..._notIn(page, otherListings), ...page])
  }

  /** Add a page's threads to what's already loaded — the next page of a listing. */
  function _addThreads(id: string, page: Thread[]) {
    _writeThreads(id, [..._notIn(page, _byAccount.value[id] ?? []), ...page])
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
    if (!isFirstPage) loadingMore.value = true
    error.value = null
    const result = await api.listThreads(id, {
      status,
      cursor,
      limit: PAGE_SIZE,
      refresh: refresh ? new Date().toISOString() : undefined,
    })
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
    // A status-scoped first page is the whole front of that listing, so it replaces what
    // the listing held. The unscoped "All" page is a mix that speaks for no listing in
    // full — treating it as a replacement would drop active threads it happened not to
    // include, and shrink the badge. It only ever adds. A filtered request (when this
    // grows sender/search options) is the same case: it returns a subset of a listing,
    // never the listing, so it must add rather than replace.
    if (isFirstPage && status !== undefined) _replaceListing(id, status, page.threads)
    else _addThreads(id, page.threads)
    if (status === 'active') _activeCursor.value = { ..._activeCursor.value, [id]: next }
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

  async function snoozeThread(threadId: string, followupAt: string): Promise<Result<Thread, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    // No optimistic pre-patch here (unlike setStatus's callers, this request can be
    // rejected by the server — e.g. a malformed followupAt) — the cache must only
    // reflect 'archived' once the server has actually confirmed it, or a rejected
    // request would leave the UI showing snoozed while the thread is still active.
    const result = await api.patchThread(id, threadId, { status: 'archived', followupAt })
    if (result.isErr()) return err(result.error)
    _upsertThread(result.value)
    return ok(result.value)
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
    snoozeThread,
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
