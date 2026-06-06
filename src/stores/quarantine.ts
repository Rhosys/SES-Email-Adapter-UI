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

interface BucketState {
  items: Signal[]
  cursor?: string
}

interface QuarantinePageState {
  visible: BucketState
  hidden: BucketState
}

function byReceivedDesc(a: Signal, b: Signal) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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

  function _state(id: string): QuarantinePageState {
    return _byAccount.value[id] ?? { visible: { items: [] }, hidden: { items: [] } }
  }

  const quarantineVisible = computed<Signal[]>(() =>
    accountStore.accountId ? _state(accountStore.accountId).visible.items : [],
  )

  const quarantineHidden = computed<Signal[]>(() =>
    accountStore.accountId ? _state(accountStore.accountId).hidden.items : [],
  )

  const hasMore = computed(() => {
    if (!accountStore.accountId) return false
    const s = _state(accountStore.accountId)
    return !!(s.visible.cursor || s.hidden.cursor)
  })

  function buildParams(cursor?: string): QuarantineSignalListParams {
    const p: QuarantineSignalListParams = { limit: 50 }
    if (filters.value.sender) p.sender = filters.value.sender
    if (filters.value.after) p.after = filters.value.after
    if (filters.value.before) p.before = filters.value.before
    if (cursor) p.cursor = cursor
    return p
  }

  async function fetchSignals(reset = false) {
    const id = accountStore.accountId
    if (!id) return
    if (reset) {
      _byAccount.value = {
        ..._byAccount.value,
        [id]: { visible: { items: [] }, hidden: { items: [] } },
      }
    }
    loading.value = true
    error.value = null

    const [visResult, hidResult] = await Promise.all([
      api.listQuarantinedSignals(id, 'quarantine_visible', buildParams()),
      api.listQuarantinedSignals(id, 'quarantine_hidden', buildParams()),
    ])

    loading.value = false

    if (visResult.isErr()) { error.value = visResult.error.message; return }
    if (hidResult.isErr()) { error.value = hidResult.error.message; return }

    _byAccount.value = {
      ..._byAccount.value,
      [id]: {
        visible: {
          items: [...visResult.value.signals].sort(byReceivedDesc),
          cursor: visResult.value.pagination.cursor ?? undefined,
        },
        hidden: {
          items: [...hidResult.value.signals].sort(byReceivedDesc),
          cursor: hidResult.value.pagination.cursor ?? undefined,
        },
      },
    }
  }

  // Exhaust all visible pages before moving to hidden pages.
  async function fetchMore() {
    const id = accountStore.accountId
    if (!id || !hasMore.value || loadingMore.value) return
    loadingMore.value = true

    const s = _state(id)

    if (s.visible.cursor) {
      const result = await api.listQuarantinedSignals(
        id,
        'quarantine_visible',
        buildParams(s.visible.cursor),
      )
      loadingMore.value = false
      if (result.isErr()) { error.value = result.error.message; return }
      _byAccount.value = {
        ..._byAccount.value,
        [id]: {
          ...s,
          visible: {
            items: [...s.visible.items, ...result.value.signals].sort(byReceivedDesc),
            cursor: result.value.pagination.cursor ?? undefined,
          },
        },
      }
    } else if (s.hidden.cursor) {
      const result = await api.listQuarantinedSignals(
        id,
        'quarantine_hidden',
        buildParams(s.hidden.cursor),
      )
      loadingMore.value = false
      if (result.isErr()) { error.value = result.error.message; return }
      _byAccount.value = {
        ..._byAccount.value,
        [id]: {
          ...s,
          hidden: {
            items: [...s.hidden.items, ...result.value.signals].sort(byReceivedDesc),
            cursor: result.value.pagination.cursor ?? undefined,
          },
        },
      }
    } else {
      loadingMore.value = false
    }
  }

  function _removeSignal(id: string, signalId: string) {
    const s = _state(id)
    _byAccount.value = {
      ..._byAccount.value,
      [id]: {
        visible: { ...s.visible, items: s.visible.items.filter((x) => x.signalId !== signalId) },
        hidden: { ...s.hidden, items: s.hidden.items.filter((x) => x.signalId !== signalId) },
      },
    }
  }

  async function allow(signalId: string) {
    const id = accountStore.accountId
    if (!id) return false
    actionPending.value = new Set([...actionPending.value, signalId])
    const result = await api.quarantineResponse(id, signalId, 'active')
    actionPending.value = new Set([...actionPending.value].filter((x) => x !== signalId))
    if (result.isErr()) { error.value = result.error.message; return false }
    _removeSignal(id, signalId)
    return true
  }

  async function reject(signalId: string) {
    const id = accountStore.accountId
    if (!id) return false
    actionPending.value = new Set([...actionPending.value, signalId])
    const result = await api.quarantineResponse(id, signalId, 'block_hidden')
    actionPending.value = new Set([...actionPending.value].filter((x) => x !== signalId))
    if (result.isErr()) { error.value = result.error.message; return false }
    _removeSignal(id, signalId)
    return true
  }

  async function rejectForAlias(signalId: string, toAddress: string, fromAddress: string) {
    const id = accountStore.accountId
    if (!id) return false
    actionPending.value = new Set([...actionPending.value, signalId])
    const sender = fromAddress.includes('@') ? fromAddress.split('@')[1] : fromAddress
    const [aliasResult, responseResult] = await Promise.all([
      api.addAliasSender(id, toAddress, { sender, policy: 'block_hidden' }),
      api.quarantineResponse(id, signalId, 'block_hidden'),
    ])
    actionPending.value = new Set([...actionPending.value].filter((x) => x !== signalId))
    if (aliasResult.isErr()) { error.value = aliasResult.error.message; return false }
    if (responseResult.isErr()) { error.value = responseResult.error.message; return false }
    _removeSignal(id, signalId)
    return true
  }

  function setFilters(next: Partial<QuarantineFilters>) {
    filters.value = { ...filters.value, ...next }
  }

  function clearError() {
    error.value = null
  }

  return {
    quarantineVisible,
    quarantineHidden,
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
