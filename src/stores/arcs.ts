import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ok, err, type Result } from 'neverthrow'
import { api, ApiError } from '@/lib/api'
import logger from '@/lib/logger'
import { useAccountStore } from '@/stores/account'
import { NoCurrentAccountError } from '@/stores/errors'
import type { Arc, ArcStatus } from '@/types/server'

type TabKey = 'active' | 'archived' | 'all'

export const useArcsStore = defineStore('arcs', () => {
  const accountStore = useAccountStore()

  const _byAccount = ref<Record<string, Arc[]>>({})
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
  // which can contain arcs of mixed statuses (e.g. an archived arc opened from
  // a detail link while the inbox shows the active tab). Filtering by the active
  // tab here keeps list membership reactive to status changes: when a mutation
  // flips an arc's status in the cache, it automatically enters/leaves the list
  // shown for the current tab without any manual splicing.
  const items = computed<Arc[]>(() => {
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
    () => items.value.length > 0 && items.value.every((a) => selectedIds.value.has(a.arcId)),
  )

  function byLastSignalDesc(a: Arc, b: Arc) {
    return new Date(b.lastSignalAt).getTime() - new Date(a.lastSignalAt).getTime()
  }

  const sortedItems = computed<Arc[]>(() => [...items.value].sort(byLastSignalDesc))

  // ─── Cache mutation helpers ───────────────────────────────────────────────
  // All writes funnel through these so the store stays the single source of
  // truth and every reactive consumer (lists, counts, badges) updates together.

  function _writeArcs(id: string, arcs: Arc[]) {
    _byAccount.value = { ..._byAccount.value, [id]: arcs }
  }

  /**
   * Merge a full arc object into the cache — used for responses that return the
   * complete resource (GET/POST/PUT and PATCH responses that echo the arc).
   * Replaces the existing entry or prepends a new one.
   */
  function _upsertArc(arc: Arc) {
    const id = accountStore.accountId
    if (!id) return
    const existing = _byAccount.value[id] ?? []
    const idx = existing.findIndex((a) => a.arcId === arc.arcId)
    _writeArcs(id, idx >= 0 ? existing.map((a) => (a.arcId === arc.arcId ? arc : a)) : [arc, ...existing])
  }

  /**
   * Merge partial fields into a cached arc — used for optimistic updates and for
   * responses that don't carry a full arc object (e.g. the unsubscribe endpoint).
   * No-op when the arc isn't cached.
   */
  function _patchArcLocal(arcId: string, partial: Partial<Arc>) {
    const id = accountStore.accountId
    if (!id) return
    const existing = _byAccount.value[id] ?? []
    if (!existing.some((a) => a.arcId === arcId)) return
    _writeArcs(id, existing.map((a) => (a.arcId === arcId ? { ...a, ...partial } : a)))
  }

  async function fetchArcs(reset = false) {
    const id = accountStore.accountId
    if (!id) return
    if (reset) {
      _cursors.value = { ..._cursors.value, [id]: undefined }
      selectedIds.value.clear()
    }
    loading.value = true
    error.value = null
    const statusParam = activeTab.value === 'all' ? undefined : activeTab.value
    const result = await api.listArcs(id, { status: statusParam, limit: 50 })
    loading.value = false
    if (result.isErr()) {
      if ((_byAccount.value[id] ?? []).length > 0) {
        logger.warn({ title: 'Arcs fetch failed with cache available', error: result.error.message })
      } else {
        error.value = result.error.message
      }
      return
    }
    const page = result.value
    const existing = _byAccount.value[id] ?? []
    _byAccount.value = {
      ..._byAccount.value,
      [id]: reset ? page.arcs : [...existing, ...page.arcs],
    }
    _cursors.value = { ..._cursors.value, [id]: page.pagination.cursor ?? undefined }
  }

  async function fetchMoreArcs() {
    const id = accountStore.accountId
    if (!id || !hasMore.value || loadingMore.value) return
    loadingMore.value = true
    const statusParam = activeTab.value === 'all' ? undefined : activeTab.value
    const result = await api.listArcs(id, {
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
      [id]: [...existing, ...page.arcs],
    }
    _cursors.value = { ..._cursors.value, [id]: page.pagination.cursor ?? undefined }
  }

  function setTab(tab: TabKey) {
    activeTab.value = tab
    void fetchArcs(true)
  }

  function toggleSelect(id: string) {
    if (selectedIds.value.has(id)) {
      selectedIds.value.delete(id)
    } else {
      selectedIds.value.add(id)
    }
  }

  function selectAll() {
    items.value.forEach((a) => selectedIds.value.add(a.arcId))
  }

  function clearSelection() {
    selectedIds.value.clear()
  }

  async function _bulkStatus(status: ArcStatus, verb: string) {
    const id = accountStore.accountId
    if (!id) return
    const ids = [...selectedIds.value]
    // Optimistic: flip status in the cache so the reactive tab filter drops them immediately.
    ids.forEach((arcId) => _patchArcLocal(arcId, { status }))
    clearSelection()
    bulkActionPending.value = true
    const results = await Promise.all(ids.map((arcId) => api.patchArc(id, arcId, { status })))
    bulkActionPending.value = false
    // Reconcile with the full arc each response returns.
    results.forEach((r) => r.map((arc) => _upsertArc(arc)))
    const failed = results.filter((r) => r.isErr())
    if (failed.length > 0) {
      error.value = `Failed to ${verb} ${failed.length} thread(s)`
      // Re-fetch to restore consistent state
      await fetchArcs(true)
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
      ids.map((arcId) => {
        const arc = items.value.find((a) => a.arcId === arcId)
        const labels = arc ? [...new Set([...arc.labels, label])] : [label]
        return api.patchArc(id, arcId, { labels })
      }),
    )
    bulkActionPending.value = false
    // Apply each response (carries server-normalized labels) back to the cache.
    results.forEach((r) => r.map((arc) => _upsertArc(arc)))
    const failed = results.filter((r) => r.isErr())
    if (failed.length > 0) {
      error.value = `Failed to label ${failed.length} thread(s)`
    }
  }

  async function refreshArc(arcId: string) {
    const id = accountStore.accountId
    if (!id) return
    const result = await api.getArc(id, arcId)
    if (result.isErr()) {
      if (result.error.status === 404) removeArc(arcId)
      return
    }
    _upsertArc(result.value)
  }

  function getArc(arcId: string): Arc | undefined {
    const id = accountStore.accountId
    if (!id) return undefined
    const existing = (_byAccount.value[id] ?? []).find((a) => a.arcId === arcId)
    // Fire background refresh regardless of cache hit
    void refreshArc(arcId)
    return existing
  }

  async function getArcAsync(arcId: string): Promise<Arc | undefined> {
    const id = accountStore.accountId
    if (!id) return undefined
    const existing = (_byAccount.value[id] ?? []).find((a) => a.arcId === arcId)
    if (existing) return existing
    // Not cached — fetch and insert
    const result = await api.getArc(id, arcId)
    if (result.isErr()) {
      if (result.error.status === 404) removeArc(arcId)
      return undefined
    }
    _upsertArc(result.value)
    return result.value
  }

  function removeArc(id: string) {
    const accId = accountStore.accountId
    if (!accId || !_byAccount.value[accId]) return
    _byAccount.value = {
      ..._byAccount.value,
      [accId]: (_byAccount.value[accId] ?? []).filter((a) => a.arcId !== id),
    }
  }

  /**
   * Change an arc's status. The PATCH response echoes the full arc, so the
   * cache is updated from the response; the reactive tab filter then moves the
   * arc between lists automatically.
   */
  async function setStatus(
    arcId: string,
    status: ArcStatus,
  ): Promise<Result<Arc, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    const result = await api.patchArc(id, arcId, { status })
    if (result.isErr()) return err(result.error)
    _upsertArc(result.value)
    return ok(result.value)
  }

  function archiveArc(arcId: string) {
    return setStatus(arcId, 'archived')
  }

  function moveToInbox(arcId: string) {
    return setStatus(arcId, 'active')
  }

  function deleteArc(arcId: string) {
    return setStatus(arcId, 'deleted')
  }

  async function labelArc(arcId: string, labels: string[]): Promise<Result<Arc, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    const result = await api.patchArc(id, arcId, { labels })
    if (result.isErr()) return err(result.error)
    _upsertArc(result.value)
    return ok(result.value)
  }

  async function unsubscribeArc(arcId: string): Promise<Result<{ status: string; url?: string }, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    const result = await api.unsubscribeArc(id, arcId)
    if (result.isErr()) return err(result.error)
    // The unsubscribe response carries no arc object; it archives the arc
    // server-side, so patch the cached status directly on success.
    _patchArcLocal(arcId, { status: 'archived' })
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
    fetchArcs,
    fetchMoreArcs,
    refreshArc,
    setTab,
    toggleSelect,
    selectAll,
    clearSelection,
    bulkArchive,
    bulkMoveToInbox,
    bulkDelete,
    bulkLabel,
    setStatus,
    archiveArc,
    moveToInbox,
    deleteArc,
    labelArc,
    unsubscribeArc,
    removeArc,
    getArc,
    getArcAsync,
  }
}, {
  persist: {
    accountKeyedRef: '_byAccount',
    filter: (items) => (items as Arc[]).filter((a) => a.status === 'active'),
  },
})
