import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
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
    () => items.value.length > 0 && items.value.every((a) => selectedIds.value.has(a.id)),
  )

  // Auth+critical arcs are pinned to the top — domain rule from WORKFLOW_UX_SPEC
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
        items: reset ? page.items : [...existing, ...page.items],
        nextCursor: page.nextCursor,
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
        items: [...existing, ...page.items],
        nextCursor: page.nextCursor,
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
    items.value.forEach((a) => selectedIds.value.add(a.id))
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
          items: (_byAccount.value[id]?.items ?? []).filter((a) => !selectedIds.value.has(a.id)),
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
      error.value = `Failed to archive ${failed.length} arc(s)`
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
        const arc = items.value.find((a) => a.id === arcId)
        const labels = arc ? [...new Set([...arc.labels, label])] : [label]
        return api.patchArc(id, arcId, { labels })
      }),
    )
    bulkActionPending.value = false
    const failed = results.filter((r) => r.isErr())
    if (failed.length > 0) {
      error.value = `Failed to label ${failed.length} arc(s)`
    }
    // Re-fetch to pick up server-side label normalization
    await fetchArcs(true)
  }

  function removeArc(id: string) {
    const accId = accountStore.accountId
    if (!accId || !_byAccount.value[accId]) return
    _byAccount.value[accId] = {
      ..._byAccount.value[accId],
      items: _byAccount.value[accId].items.filter((a) => a.id !== id),
    }
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
    setTab,
    toggleSelect,
    selectAll,
    clearSelection,
    bulkArchive,
    bulkLabel,
    removeArc,
  }
})
