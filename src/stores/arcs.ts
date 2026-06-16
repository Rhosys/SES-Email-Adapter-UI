import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ok, err, type Result } from 'neverthrow'
import { api, ApiError } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import { NoCurrentAccountError } from '@/stores/errors'
import type { Arc, ArcStatus } from '@/types/server'

type TabKey = 'active' | 'archived' | 'all'

interface ArcPageState {
  items: Arc[]
  nextCursor?: string
}

export const useArcsStore = defineStore('arcs', () => {
  const accountStore = useAccountStore()

  const _byAccount = ref<Record<string, ArcPageState>>({})
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const activeTab = ref<TabKey>('active')
  const selectedIds = ref(new Set<string>())
  const bulkActionPending = ref(false)

  const items = computed<Arc[]>(() =>
    accountStore.accountId ? (_byAccount.value[accountStore.accountId]?.items ?? []) : [],
  )

  const nextCursor = computed<string | undefined>(() =>
    accountStore.accountId
      ? (_byAccount.value[accountStore.accountId]?.nextCursor ?? undefined)
      : undefined,
  )

  const hasMore = computed(() => nextCursor.value !== undefined)

  const allSelected = computed(
    () => items.value.length > 0 && items.value.every((a) => selectedIds.value.has(a.arcId)),
  )

  // Auth+critical threads are pinned to the top — domain rule from WORKFLOW_UX_SPEC
  const sortedItems = computed<Arc[]>(() => {
    const authCritical = items.value.filter(
      (a) => a.workflow === 'auth' && a.urgency === 'critical',
    )
    const rest = items.value.filter((a) => !(a.workflow === 'auth' && a.urgency === 'critical'))
    return [...authCritical, ...rest]
  })

  async function fetchArcs(reset = false) {
    const id = accountStore.accountId
    if (!id) return
    if (reset) {
      _byAccount.value = { ..._byAccount.value, [id]: { items: [], nextCursor: undefined } }
      selectedIds.value.clear()
    }
    loading.value = true
    error.value = null
    const statusParam = activeTab.value === 'all' ? undefined : activeTab.value
    const result = await api.listArcs(id, { status: statusParam, limit: 50 })
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    const page = result.value
    const existing = _byAccount.value[id]?.items ?? []
    _byAccount.value = {
      ..._byAccount.value,
      [id]: {
        items: reset ? page.arcs : [...existing, ...page.arcs],
        nextCursor: page.pagination.cursor ?? undefined,
      },
    }
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
    const existing = _byAccount.value[id]?.items ?? []
    _byAccount.value = {
      ..._byAccount.value,
      [id]: {
        items: [...existing, ...page.arcs],
        nextCursor: page.pagination.cursor ?? undefined,
      },
    }
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

  async function bulkArchive() {
    const id = accountStore.accountId
    if (!id) return
    const ids = [...selectedIds.value]
    // Optimistic: remove from list immediately when on active tab
    if (activeTab.value === 'active') {
      _byAccount.value = {
        ..._byAccount.value,
        [id]: {
          items: (_byAccount.value[id]?.items ?? []).filter((a) => !selectedIds.value.has(a.arcId)),
          nextCursor: _byAccount.value[id]?.nextCursor,
        },
      }
    }
    clearSelection()
    bulkActionPending.value = true
    const results = await Promise.all(
      ids.map((arcId) => api.patchArc(id, arcId, { status: 'archived' as ArcStatus })),
    )
    bulkActionPending.value = false
    const failed = results.filter((r) => r.isErr())
    if (failed.length > 0) {
      error.value = `Failed to archive ${failed.length} thread(s)`
      // Re-fetch to restore consistent state
      await fetchArcs(true)
    }
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
    const failed = results.filter((r) => r.isErr())
    if (failed.length > 0) {
      error.value = `Failed to label ${failed.length} thread(s)`
    }
    // Re-fetch to pick up server-side label normalization
    await fetchArcs(true)
  }

  async function bulkDelete() {
    const id = accountStore.accountId
    if (!id) return
    const ids = [...selectedIds.value]
    _byAccount.value = {
      ..._byAccount.value,
      [id]: {
        items: (_byAccount.value[id]?.items ?? []).filter((a) => !selectedIds.value.has(a.arcId)),
        nextCursor: _byAccount.value[id]?.nextCursor,
      },
    }
    clearSelection()
    bulkActionPending.value = true
    const results = await Promise.all(
      ids.map((arcId) => api.patchArc(id, arcId, { status: 'deleted' as ArcStatus })),
    )
    bulkActionPending.value = false
    const failed = results.filter((r) => r.isErr())
    if (failed.length > 0) {
      error.value = `Failed to delete ${failed.length} thread(s)`
      await fetchArcs(true)
    }
  }

  async function refreshArc(arcId: string) {
    const id = accountStore.accountId
    if (!id) return
    const result = await api.getArc(id, arcId)
    if (result.isErr()) return
    const updated = result.value
    const existing = _byAccount.value[id]?.items ?? []
    const idx = existing.findIndex((a) => a.arcId === arcId)
    _byAccount.value = {
      ..._byAccount.value,
      [id]: {
        ..._byAccount.value[id],
        items:
          idx >= 0
            ? existing.map((a) => (a.arcId === arcId ? updated : a))
            : [updated, ...existing], // new thread — prepend
      },
    }
  }

  function removeArc(id: string) {
    const accId = accountStore.accountId
    if (!accId || !_byAccount.value[accId]) return
    _byAccount.value[accId] = {
      ..._byAccount.value[accId],
      items: _byAccount.value[accId].items.filter((a) => a.arcId !== id),
    }
  }

  async function archiveArc(arcId: string): Promise<Result<Arc, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    const result = await api.patchArc(id, arcId, { status: 'archived' })
    if (result.isErr()) return err(result.error)
    // Update in the list if present
    const existing = _byAccount.value[id]?.items ?? []
    if (activeTab.value === 'active') {
      _byAccount.value = {
        ..._byAccount.value,
        [id]: { ..._byAccount.value[id], items: existing.filter((a) => a.arcId !== arcId) },
      }
    } else {
      _byAccount.value = {
        ..._byAccount.value,
        [id]: { ..._byAccount.value[id], items: existing.map((a) => (a.arcId === arcId ? result.value : a)) },
      }
    }
    return ok(result.value)
  }

  async function labelArc(arcId: string, labels: string[]): Promise<Result<Arc, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    const result = await api.patchArc(id, arcId, { labels })
    if (result.isErr()) return err(result.error)
    // Update in the list if present
    const existing = _byAccount.value[id]?.items ?? []
    _byAccount.value = {
      ..._byAccount.value,
      [id]: { ..._byAccount.value[id], items: existing.map((a) => (a.arcId === arcId ? result.value : a)) },
    }
    return ok(result.value)
  }

  async function unsubscribeArc(arcId: string): Promise<Result<{ status: string; url?: string }, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    const result = await api.unsubscribeArc(id, arcId)
    if (result.isErr()) return err(result.error)
    // Arc is now archived — remove from active list
    if (activeTab.value === 'active') {
      const existing = _byAccount.value[id]?.items ?? []
      _byAccount.value = {
        ..._byAccount.value,
        [id]: { ..._byAccount.value[id], items: existing.filter((a) => a.arcId !== arcId) },
      }
    }
    return ok(result.value)
  }

  return {
    items,
    sortedItems,
    nextCursor,
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
    bulkDelete,
    bulkLabel,
    archiveArc,
    labelArc,
    unsubscribeArc,
    removeArc,
  }
})
