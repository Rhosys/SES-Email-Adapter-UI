import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import type { QuarantineSignalListParams } from '@/lib/api'
import type { Signal } from '@/types/server'

export interface QuarantineFilters {
  sender: string
  after: string
  before: string
}

export const useQuarantineStore = defineStore('quarantine', () => {
  const items = ref<Signal[]>([])
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const actionPending = ref<Set<string>>(new Set())

  const filters = ref<QuarantineFilters>({
    sender: '',
    after: '',
    before: '',
  })

  const _nextCursors = ref<{ visible?: string; hidden?: string }>({})
  const hasMore = computed(() => !!_nextCursors.value.visible || !!_nextCursors.value.hidden)

  function buildParams(cursor?: string): QuarantineSignalListParams {
    const p: QuarantineSignalListParams = { limit: 50 }
    if (filters.value.sender) p.sender = filters.value.sender
    if (filters.value.after) p.after = filters.value.after
    if (filters.value.before) p.before = filters.value.before
    if (cursor) p.cursor = cursor
    return p
  }

  function mergeAndSort(a: Signal[], b: Signal[]): Signal[] {
    return [...a, ...b].sort(
      (x, y) => new Date(y.receivedAt).getTime() - new Date(x.receivedAt).getTime(),
    )
  }

  async function fetchSignals(accountId: string, reset = false) {
    if (reset) {
      items.value = []
      _nextCursors.value = {}
    }
    loading.value = true
    error.value = null

    const [visResult, hidResult] = await Promise.all([
      api.listQuarantinedSignals(accountId, 'quarantine_visible', buildParams()),
      api.listQuarantinedSignals(accountId, 'quarantine_hidden', buildParams()),
    ])

    loading.value = false

    if (visResult.isErr()) {
      error.value = visResult.error.message
      return
    }
    if (hidResult.isErr()) {
      error.value = hidResult.error.message
      return
    }

    items.value = mergeAndSort(visResult.value.items, hidResult.value.items)
    _nextCursors.value = {
      visible: visResult.value.nextCursor,
      hidden: hidResult.value.nextCursor,
    }
  }

  async function fetchMore(accountId: string) {
    if (!hasMore.value || loadingMore.value) return
    loadingMore.value = true

    const pendingVis = _nextCursors.value.visible
      ? api.listQuarantinedSignals(
          accountId,
          'quarantine_visible',
          buildParams(_nextCursors.value.visible),
        )
      : null
    const pendingHid = _nextCursors.value.hidden
      ? api.listQuarantinedSignals(
          accountId,
          'quarantine_hidden',
          buildParams(_nextCursors.value.hidden),
        )
      : null

    const [visResult, hidResult] = await Promise.all([pendingVis, pendingHid])
    loadingMore.value = false

    if (visResult?.isErr()) {
      error.value = visResult.error.message
      return
    }
    if (hidResult?.isErr()) {
      error.value = hidResult.error.message
      return
    }

    const newItems = mergeAndSort(
      visResult?.isOk() ? visResult.value.items : [],
      hidResult?.isOk() ? hidResult.value.items : [],
    )

    items.value = [...items.value, ...newItems]
    _nextCursors.value = {
      visible: visResult?.isOk() ? visResult.value.nextCursor : undefined,
      hidden: hidResult?.isOk() ? hidResult.value.nextCursor : undefined,
    }
  }

  async function allow(accountId: string, signalId: string) {
    actionPending.value.add(signalId)
    const result = await api.quarantineResponse(accountId, signalId, 'active')
    actionPending.value.delete(signalId)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    items.value = items.value.filter((s) => s.id !== signalId)
    return true
  }

  async function reject(accountId: string, signalId: string) {
    actionPending.value.add(signalId)
    const result = await api.quarantineResponse(accountId, signalId, 'block_reject')
    actionPending.value.delete(signalId)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    items.value = items.value.filter((s) => s.id !== signalId)
    return true
  }

  async function rejectForAlias(
    accountId: string,
    signalId: string,
    toAddress: string,
    fromAddress: string,
  ) {
    actionPending.value.add(signalId)
    const [aliasResult, responseResult] = await Promise.all([
      api.updateAlias(accountId, toAddress, { blockedSenders: [fromAddress] }),
      api.quarantineResponse(accountId, signalId, 'block_reject'),
    ])
    actionPending.value.delete(signalId)
    if (aliasResult.isErr()) {
      error.value = aliasResult.error.message
      return false
    }
    if (responseResult.isErr()) {
      error.value = responseResult.error.message
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
    hasMore,
    loading,
    loadingMore,
    error,
    actionPending,
    filters,
    fetchSignals,
    fetchMore,
    allow,
    reject,
    rejectForAlias,
    setFilters,
    clearError,
  }
})
