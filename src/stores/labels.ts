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
    const start = Date.now()
    const result = await api.listLabels(id)
    const elapsed = Date.now() - start
    if (import.meta.env.MODE !== 'test' && elapsed < 1000) {
      await new Promise<void>((r) => setTimeout(r, 1000 - elapsed))
    }
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
    labelKey: string,
    body: { name?: string; color?: string; icon?: string },
  ) {
    const id = accountStore.accountId
    if (!id) return false
    const result = await api.updateLabel(id, labelKey, body)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: (_byAccount.value[id] ?? []).map((l) => (l.label === labelKey ? result.value : l)),
    }
    return true
  }

  async function deleteLabel(labelKey: string) {
    const id = accountStore.accountId
    if (!id) return false
    const result = await api.deleteLabel(id, labelKey)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: (_byAccount.value[id] ?? []).filter((l) => l.label !== labelKey),
    }
    return true
  }

  function clearError() {
    error.value = null
  }

  return { items, loading, error, fetchLabels, createLabel, updateLabel, deleteLabel, clearError }
})
