import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import type { CreateSavedViewBody, SavedView } from '@/types/server'

export const useViewsStore = defineStore('views', () => {
  const items = ref<SavedView[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const sortedViews = computed(() => [...items.value].sort((a, b) => a.position - b.position))

  async function fetchViews(accountId: string) {
    loading.value = true
    error.value = null
    const result = await api.listViews(accountId)
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    items.value = result.value
  }

  async function createView(accountId: string, body: CreateSavedViewBody) {
    const position = items.value.length
    const result = await api.createView(accountId, { ...body, position })
    if (result.isErr()) {
      error.value = result.error.message
      return null
    }
    items.value = [...items.value, result.value]
    return result.value
  }

  async function updateView(accountId: string, viewId: string, body: Partial<CreateSavedViewBody>) {
    const result = await api.updateView(accountId, viewId, body)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    items.value = items.value.map((v) => (v.id === viewId ? result.value : v))
    return true
  }

  async function deleteView(accountId: string, viewId: string) {
    const result = await api.deleteView(accountId, viewId)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    items.value = items.value.filter((v) => v.id !== viewId)
    return true
  }

  // Reorder by swapping the position values of two views, then persisting.
  function reorder(sourceId: string, targetId: string) {
    const src = items.value.find((v) => v.id === sourceId)
    const tgt = items.value.find((v) => v.id === targetId)
    if (!src || !tgt) return
    const srcPosition = src.position
    items.value = items.value.map((v) => {
      if (v.id === sourceId) return { ...v, position: tgt.position }
      if (v.id === targetId) return { ...v, position: srcPosition }
      return v
    })
    // Fire-and-forget persistence — errors are non-critical for reordering
    void api.updateView(src.accountId, sourceId, { position: tgt.position })
    void api.updateView(tgt.accountId, targetId, { position: srcPosition })
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
