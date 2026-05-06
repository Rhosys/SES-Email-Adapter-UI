import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, type QuarantineListParams } from '@/lib/api'
import type { BlockReason, DismissReason, Signal } from '@/types/server'

export interface QuarantineFilters {
  sender: string
  blockReason: BlockReason | ''
  after: string
  before: string
}

export const useQuarantineStore = defineStore('quarantine', () => {
  const items = ref<Signal[]>([])
  const nextCursor = ref<string | undefined>()
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const actionPending = ref<Set<string>>(new Set())

  const filters = ref<QuarantineFilters>({
    sender: '',
    blockReason: '',
    after: '',
    before: '',
  })

  function buildParams(cursor?: string): QuarantineListParams {
    const p: QuarantineListParams = { limit: 50 }
    if (filters.value.sender) p.sender = filters.value.sender
    if (filters.value.blockReason) p.blockReason = filters.value.blockReason
    if (filters.value.after) p.after = filters.value.after
    if (filters.value.before) p.before = filters.value.before
    if (cursor) p.cursor = cursor
    return p
  }

  async function fetchSignals(accountId: string, reset = false) {
    if (reset) {
      items.value = []
      nextCursor.value = undefined
    }
    loading.value = true
    error.value = null
    const result = await api.listQuarantined(accountId, buildParams())
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    items.value = result.value.items
    nextCursor.value = result.value.nextCursor
  }

  async function fetchMore(accountId: string) {
    if (!nextCursor.value || loadingMore.value) return
    loadingMore.value = true
    const result = await api.listQuarantined(accountId, buildParams(nextCursor.value))
    loadingMore.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    items.value = [...items.value, ...result.value.items]
    nextCursor.value = result.value.nextCursor
  }

  async function allow(accountId: string, signalId: string) {
    actionPending.value.add(signalId)
    const result = await api.allowSignal(accountId, signalId)
    actionPending.value.delete(signalId)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    items.value = items.value.filter((s) => s.id !== signalId)
    return true
  }

  async function dismiss(accountId: string, signalId: string, reason?: DismissReason) {
    actionPending.value.add(signalId)
    const result = await api.dismissSignal(accountId, signalId, reason)
    actionPending.value.delete(signalId)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    items.value = items.value.filter((s) => s.id !== signalId)
    return true
  }

  function setFilters(next: Partial<QuarantineFilters>) {
    filters.value = { ...filters.value, ...next }
  }

  function clearError() {
    error.value = null
  }

  return {
    items,
    nextCursor,
    loading,
    loadingMore,
    error,
    actionPending,
    filters,
    fetchSignals,
    fetchMore,
    allow,
    dismiss,
    setFilters,
    clearError,
  }
})
