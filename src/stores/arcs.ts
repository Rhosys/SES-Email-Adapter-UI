import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import type { Arc, ArcStatus } from '@/types/server'

type TabKey = 'active' | 'archived' | 'all'

export const useArcsStore = defineStore('arcs', () => {
  const items = ref<Arc[]>([])
  const nextCursor = ref<string | undefined>()
  const total = ref(0)
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const activeTab = ref<TabKey>('active')
  const selectedIds = ref(new Set<string>())
  const bulkActionPending = ref(false)

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

  async function fetchArcs(accountId: string, reset = false) {
    if (reset) {
      items.value = []
      nextCursor.value = undefined
      selectedIds.value.clear()
    }
    loading.value = true
    error.value = null
    const statusParam = activeTab.value === 'all' ? undefined : activeTab.value
    const result = await api.listArcs(accountId, { status: statusParam, limit: 50 })
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    const page = result.value
    items.value = reset ? page.items : [...items.value, ...page.items]
    nextCursor.value = page.nextCursor
    total.value = page.total
  }

  async function fetchMoreArcs(accountId: string) {
    if (!hasMore.value || loadingMore.value) return
    loadingMore.value = true
    const statusParam = activeTab.value === 'all' ? undefined : activeTab.value
    const result = await api.listArcs(accountId, {
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
    items.value = [...items.value, ...page.items]
    nextCursor.value = page.nextCursor
    total.value = page.total
  }

  function setTab(tab: TabKey, accountId: string) {
    activeTab.value = tab
    void fetchArcs(accountId, true)
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

  async function bulkArchive(accountId: string) {
    const ids = [...selectedIds.value]
    // Optimistic: remove from list immediately when on active tab
    if (activeTab.value === 'active') {
      items.value = items.value.filter((a) => !selectedIds.value.has(a.id))
    }
    clearSelection()
    bulkActionPending.value = true
    const results = await Promise.all(
      ids.map((id) => api.patchArc(accountId, id, { status: 'archived' as ArcStatus })),
    )
    bulkActionPending.value = false
    const failed = results.filter((r) => r.isErr())
    if (failed.length > 0) {
      error.value = `Failed to archive ${failed.length} arc(s)`
      // Re-fetch to restore consistent state
      await fetchArcs(accountId, true)
    }
  }

  async function bulkLabel(accountId: string, label: string) {
    const ids = [...selectedIds.value]
    bulkActionPending.value = true
    const results = await Promise.all(
      ids.map((id) => {
        const arc = items.value.find((a) => a.id === id)
        const labels = arc ? [...new Set([...arc.labels, label])] : [label]
        return api.patchArc(accountId, id, { labels })
      }),
    )
    bulkActionPending.value = false
    const failed = results.filter((r) => r.isErr())
    if (failed.length > 0) {
      error.value = `Failed to label ${failed.length} arc(s)`
    }
    // Re-fetch to pick up server-side label normalization
    await fetchArcs(accountId, true)
  }

  return {
    items,
    sortedItems,
    nextCursor,
    total,
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
  }
})
