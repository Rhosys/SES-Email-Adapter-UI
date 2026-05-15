import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import type { CreateSavedViewBody, SavedView } from '@/types/server'

export const useViewsStore = defineStore('views', () => {
  const accountStore = useAccountStore()

  const _byAccount = ref<Record<string, SavedView[]>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  const items = computed<SavedView[]>(() =>
    accountStore.accountId ? (_byAccount.value[accountStore.accountId] ?? []) : [],
  )

  const sortedViews = computed(() => [...items.value].sort((a, b) => a.position - b.position))

  async function fetchViews() {
    const id = accountStore.accountId
    if (!id) return
    loading.value = true
    error.value = null
    const result = await api.listViews(id)
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    _byAccount.value = { ..._byAccount.value, [id]: result.value }
  }

  async function createView(body: CreateSavedViewBody) {
    const id = accountStore.accountId
    if (!id) return null
    const position = items.value.length
    const result = await api.createView(id, { ...body, position })
    if (result.isErr()) {
      error.value = result.error.message
      return null
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: [...(_byAccount.value[id] ?? []), result.value],
    }
    return result.value
  }

  async function updateView(viewId: string, body: Partial<CreateSavedViewBody>) {
    const id = accountStore.accountId
    if (!id) return false
    const result = await api.updateView(id, viewId, body)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: (_byAccount.value[id] ?? []).map((v) => (v.id === viewId ? result.value : v)),
    }
    return true
  }

  async function deleteView(viewId: string) {
    const id = accountStore.accountId
    if (!id) return false
    const result = await api.deleteView(id, viewId)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: (_byAccount.value[id] ?? []).filter((v) => v.id !== viewId),
    }
    return true
  }

  // Reorder by swapping the position values of two views, then persisting.
  function reorder(sourceId: string, targetId: string) {
    const id = accountStore.accountId
    if (!id) return
    const src = items.value.find((v) => v.id === sourceId)
    const tgt = items.value.find((v) => v.id === targetId)
    if (!src || !tgt) return
    const srcPosition = src.position
    _byAccount.value = {
      ..._byAccount.value,
      [id]: (_byAccount.value[id] ?? []).map((v) => {
        if (v.id === sourceId) return { ...v, position: tgt.position }
        if (v.id === targetId) return { ...v, position: srcPosition }
        return v
      }),
    }
    // Fire-and-forget persistence — errors are non-critical for reordering
    void api.updateView(id, sourceId, { position: tgt.position })
    void api.updateView(id, targetId, { position: srcPosition })
  }

  function clearError() {
    error.value = null
  }

  return {
    items,
    loading,
    error,
    sortedViews,
    fetchViews,
    createView,
    updateView,
    deleteView,
    reorder,
    clearError,
  }
})
