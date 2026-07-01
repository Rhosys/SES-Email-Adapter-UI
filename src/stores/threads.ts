import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ok, err, type Result } from 'neverthrow'
import { api, ApiError } from '@/lib/api'
import logger from '@/lib/logger'
import { useAccountStore } from '@/stores/account'
import { NoCurrentAccountError } from '@/stores/errors'
import type { Thread, ThreadStatus } from '@/types/server'

type TabKey = 'active' | 'archived' | 'all'

export const useThreadsStore = defineStore('threads', () => {
  const accountStore = useAccountStore()

  const _byAccount = ref<Record<string, Thread[]>>({})
  const _cursors = ref<Record<string, string | undefined>>({})
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const activeTab = ref<TabKey>('active')
  const selectedIds = ref(new Set<string>())
  const bulkActionPending = ref(false)

  // Sidebar notification badge — derived from cached store data so it stays
  // accurate regardless of which tab/filters the inbox view is showing.
  const activeCount = computed(() => {
    const id = accountStore.accountId
    if (!id) return 0
    const cached = _byAccount.value[id]
    if (!Array.isArray(cached)) return 0
    return cached.filter((a) => a.status === 'active').length
  })

  const activeCountHasMore = computed(() => {
    const id = accountStore.accountId
    if (!id) return false
    return _cursors.value[id] !== undefined
  })

  // The cached list holds whatever was last fetched/inserted for the account,
  // which can contain threads of mixed statuses (e.g. an archived thread opened from
  // a detail link while the inbox shows the active tab). Filtering by the active
  // tab here keeps list membership reactive to status changes: when a mutation
  // flips a thread's status in the cache, it automatically enters/leaves the list
  // shown for the current tab without any manual splicing.
  const items = computed<Thread[]>(() => {
    const id = accountStore.accountId
    if (!id) return []
    const all = _byAccount.value[id]
    if (!Array.isArray(all)) return []
    if (activeTab.value === 'all') return all
    return all.filter((a) => a.status === activeTab.value)
  })

  const nextCursor = computed<string | undefined>(() =>
    accountStore.accountId
      ? _cursors.value[accountStore.accountId]
      : undefined,
  )

  const hasMore = computed(() => nextCursor.value !== undefined)

  const allSelected = computed(
    () => items.value.length > 0 && items.value.every((a) => selectedIds.value.has(a.threadId)),
  )

  function byLastSignalDesc(a: Thread, b: Thread) {
    return new Date(b.lastSignalAt).getTime() - new Date(a.lastSignalAt).getTime()
  }

  const sortedItems = computed<Thread[]>(() => [...items.value].sort(byLastSignalDesc))

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

  async function fetchThreads(reset = false) {
    const id = accountStore.accountId
    if (!id) return
    if (reset) {
      _cursors.value = { ..._cursors.value, [id]: undefined }
      selectedIds.value.clear()
    }
    loading.value = true
    error.value = null
    const statusParam = activeTab.value === 'all' ? undefined : activeTab.value
    const result = await api.listThreads(id, { status: statusParam, limit: 50 })
    loading.value = false
    if (result.isErr()) {
      if ((_byAccount.value[id] ?? []).length > 0) {
        logger.warn({ title: 'Threads fetch failed with cache available', error: result.error.message })
      } else {
        error.value = result.error.message
      }
      return
    }
    const page = result.value
    const existing = _byAccount.value[id] ?? []
    _byAccount.value = {
      ..._byAccount.value,
      [id]: reset ? page.threads : [...existing, ...page.threads],
    }
    _cursors.value = { ..._cursors.value, [id]: page.pagination.cursor ?? undefined }
  }

  async function fetchMoreThreads() {
    const id = accountStore.accountId
    if (!id || !hasMore.value || loadingMore.value) return
    loadingMore.value = true
    const statusParam = activeTab.value === 'all' ? undefined : activeTab.value
    const result = await api.listThreads(id, {
      status: statusParam,
      cursor: nextCursor.value,
      limit: 50,
    })
    loadingMore.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    const page = result.value
    const existing = _byAccount.value[id] ?? []
    _byAccount.value = {
      ..._byAccount.value,
      [id]: [...existing, ...page.threads],
    }
    _cursors.value = { ..._cursors.value, [id]: page.pagination.cursor ?? undefined }
  }

  function setTab(tab: TabKey) {
    activeTab.value = tab
    void fetchThreads(true)
  }

  function toggleSelect(id: string) {
    if (selectedIds.value.has(id)) {
      selectedIds.value.delete(id)
    } else {
      selectedIds.value.add(id)
    }
  }

  function selectAll() {
    items.value.forEach((a) => selectedIds.value.add(a.threadId))
  }

  function clearSelection() {
    selectedIds.value.clear()
  }

  async function _bulkStatus(status: ThreadStatus, verb: string) {
    const id = accountStore.accountId
    if (!id) return
    const ids = [...selectedIds.value]
    // Optimistic: flip status in the cache so the reactive tab filter drops them immediately.
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
      // Re-fetch to restore consistent state
      await fetchThreads(true)
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
        const thread = items.value.find((a) => a.threadId === threadId)
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
   * cache is updated from the response; the reactive tab filter then moves the
   * thread between lists automatically.
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
    items,
    sortedItems,
    nextCursor,
    activeCount,
    activeCountHasMore,
    loading,
    loadingMore,
    error,
    activeTab,
    selectedIds,
    bulkActionPending,
    hasMore,
    allSelected,
    fetchThreads,
    fetchMoreThreads,
    refreshThread,
    setTab,
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
