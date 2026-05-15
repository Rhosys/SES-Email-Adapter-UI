import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import type { QuarantineSignalListParams } from '@/lib/api'
import type { Signal } from '@/types/server'

export interface QuarantineFilters {
  sender: string
  after: string
  before: string
}

interface QuarantinePageState {
  items: Signal[]
  nextCursors: { visible?: string; hidden?: string }
}

export const useQuarantineStore = defineStore('quarantine', () => {
  const accountStore = useAccountStore()

  const _byAccount = ref<Record<string, QuarantinePageState>>({})
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const actionPending = ref<Set<string>>(new Set())

  const filters = ref<QuarantineFilters>({
    sender: '',
    after: '',
    before: '',
  })

  const items = computed<Signal[]>(() =>
    accountStore.accountId ? (_byAccount.value[accountStore.accountId]?.items ?? []) : [],
  )

  const hasMore = computed(() => {
    if (!accountStore.accountId) return false
    const cursors = _byAccount.value[accountStore.accountId]?.nextCursors
    return !!(cursors?.visible || cursors?.hidden)
  })

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

  async function fetchSignals(reset = false) {
    const id = accountStore.accountId
    if (!id) return
    if (reset) {
      _byAccount.value = {
        ..._byAccount.value,
        [id]: { items: [], nextCursors: {} },
      }
    }
    loading.value = true
    error.value = null

    const [visResult, hidResult] = await Promise.all([
      api.listQuarantinedSignals(id, 'quarantine_visible', buildParams()),
      api.listQuarantinedSignals(id, 'quarantine_hidden', buildParams()),
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

    _byAccount.value = {
      ..._byAccount.value,
      [id]: {
        items: mergeAndSort(visResult.value.items, hidResult.value.items),
        nextCursors: {
          visible: visResult.value.nextCursor,
          hidden: hidResult.value.nextCursor,
        },
      },
    }
  }

  async function fetchMore() {
    const id = accountStore.accountId
    if (!id || !hasMore.value || loadingMore.value) return
    loadingMore.value = true

    const cursors = _byAccount.value[id]?.nextCursors ?? {}

    const pendingVis = cursors.visible
      ? api.listQuarantinedSignals(id, 'quarantine_visible', buildParams(cursors.visible))
      : null
    const pendingHid = cursors.hidden
      ? api.listQuarantinedSignals(id, 'quarantine_hidden', buildParams(cursors.hidden))
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

    const existing = _byAccount.value[id]?.items ?? []
    _byAccount.value = {
      ..._byAccount.value,
      [id]: {
        items: [...existing, ...newItems],
        nextCursors: {
          visible: visResult?.isOk() ? visResult.value.nextCursor : undefined,
          hidden: hidResult?.isOk() ? hidResult.value.nextCursor : undefined,
        },
      },
    }
  }

  async function allow(signalId: string) {
    const id = accountStore.accountId
    if (!id) return false
    actionPending.value.add(signalId)
    const result = await api.quarantineResponse(id, signalId, 'active')
    actionPending.value.delete(signalId)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: {
        items: (_byAccount.value[id]?.items ?? []).filter((s) => s.id !== signalId),
        nextCursors: _byAccount.value[id]?.nextCursors ?? {},
      },
    }
    return true
  }

  async function reject(signalId: string) {
    const id = accountStore.accountId
    if (!id) return false
    actionPending.value.add(signalId)
    const result = await api.quarantineResponse(id, signalId, 'block_hidden')
    actionPending.value.delete(signalId)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: {
        items: (_byAccount.value[id]?.items ?? []).filter((s) => s.id !== signalId),
        nextCursors: _byAccount.value[id]?.nextCursors ?? {},
      },
    }
    return true
  }

  async function rejectForAlias(signalId: string, toAddress: string, fromAddress: string) {
    const id = accountStore.accountId
    if (!id) return false
    actionPending.value.add(signalId)
    const [aliasResult, responseResult] = await Promise.all([
      api.updateAlias(id, toAddress, { blockedSenders: [fromAddress] }),
      api.quarantineResponse(id, signalId, 'block_hidden'),
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
    _byAccount.value = {
      ..._byAccount.value,
      [id]: {
        items: (_byAccount.value[id]?.items ?? []).filter((s) => s.id !== signalId),
        nextCursors: _byAccount.value[id]?.nextCursors ?? {},
      },
    }
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
