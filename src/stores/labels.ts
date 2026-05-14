import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import type { Label } from '@/types/server'

export const useLabelsStore = defineStore('labels', () => {
  const accountStore = useAccountStore()

  const _byAccount = ref<Record<string, Label[]>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  const items = computed<Label[]>(() =>
    accountStore.accountId ? (_byAccount.value[accountStore.accountId] ?? []) : [],
  )

  async function fetchLabels() {
    const id = accountStore.accountId
    if (!id) return
    loading.value = true
    error.value = null
    const result = await api.listLabels(id)
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    _byAccount.value = { ..._byAccount.value, [id]: result.value }
  }

  async function createLabel(body: { name: string; color?: string; icon?: string }) {
    const id = accountStore.accountId
    if (!id) return false
    const result = await api.createLabel(id, body)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: [...(_byAccount.value[id] ?? []), result.value],
    }
    return true
  }

  async function updateLabel(
    labelId: string,
    body: { name?: string; color?: string; icon?: string },
  ) {
    const id = accountStore.accountId
    if (!id) return false
    const result = await api.updateLabel(id, labelId, body)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: (_byAccount.value[id] ?? []).map((l) => (l.id === labelId ? result.value : l)),
    }
    return true
  }

  async function deleteLabel(labelId: string) {
    const id = accountStore.accountId
    if (!id) return false
    const result = await api.deleteLabel(id, labelId)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: (_byAccount.value[id] ?? []).filter((l) => l.id !== labelId),
    }
    return true
  }

  function clearError() {
    error.value = null
  }

  return { items, loading, error, fetchLabels, createLabel, updateLabel, deleteLabel, clearError }
})
