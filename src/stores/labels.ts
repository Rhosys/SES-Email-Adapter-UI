import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'
import type { Label } from '@/types/server'

export const useLabelsStore = defineStore('labels', () => {
  const items = ref<Label[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchLabels(accountId: string) {
    loading.value = true
    error.value = null
    const result = await api.listLabels(accountId)
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    items.value = result.value
  }

  async function createLabel(
    accountId: string,
    body: { name: string; color?: string; icon?: string },
  ) {
    const result = await api.createLabel(accountId, body)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    items.value = [...items.value, result.value]
    return true
  }

  async function updateLabel(
    accountId: string,
    labelId: string,
    body: { name?: string; color?: string; icon?: string },
  ) {
    const result = await api.updateLabel(accountId, labelId, body)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    items.value = items.value.map((l) => (l.id === labelId ? result.value : l))
    return true
  }

  async function deleteLabel(accountId: string, labelId: string) {
    const result = await api.deleteLabel(accountId, labelId)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    items.value = items.value.filter((l) => l.id !== labelId)
    return true
  }

  function clearError() {
    error.value = null
  }

  return { items, loading, error, fetchLabels, createLabel, updateLabel, deleteLabel, clearError }
})
