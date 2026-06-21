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

interface QuarantineData {
  visible: Signal[]
  hidden: Signal[]
}

function byReceivedDesc(a: Signal, b: Signal) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

export const useQuarantineStore = defineStore('quarantine', () => {
  const accountStore = useAccountStore()

  const _byAccount = ref<Record<string, QuarantineData>>({})
  const _cursors = ref<Record<string, { visible?: string; hidden?: string }>>({})
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const actionPending = ref<Set<string>>(new Set())

  const filters = ref<QuarantineFilters>({
    sender: '',
    after: '',
    before: '',
  })

  // Sidebar notification badge — derived from persisted data (no separate fetch needed).
  const visibleCount = computed(() => {
    const id = accountStore.accountId
    if (!id) return 0
    return (_byAccount.value[id]?.visible ?? []).length
  })

  const visibleCountHasMore = computed(() => {
    const id = accountStore.accountId
    if (!id) return false
    return _cursors.value[id]?.visible !== undefined
  })

  function _data(id: string): QuarantineData {
    return _byAccount.value[id] ?? { visible: [], hidden: [] }
  }

  const quarantineVisible = computed<Signal[]>(() =>
    accountStore.accountId ? _data(accountStore.accountId).visible : [],
  )

  const quarantineHidden = computed<Signal[]>(() =>
    accountStore.accountId ? _data(accountStore.accountId).hidden : [],
  )

  const hasMore = computed(() => {
    if (!accountStore.accountId) return false
    const c = _cursors.value[accountStore.accountId]
    return !!(c?.visible || c?.hidden)
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
        [id]: { visible: [], hidden: [] },
      }
      const { [id]: _, ...rest } = _cursors.value
      _cursors.value = rest
    }
    loading.value = true
    error.value = null
    const start = Date.now()

    const [visResult, hidResult] = await Promise.all([
      api.listQuarantinedSignals(id, 'quarantine_visible', buildParams()),
      api.listQuarantinedSignals(id, 'quarantine_hidden', buildParams()),
    ])

    const elapsed = Date.now() - start
    if (import.meta.env.MODE !== 'test' && elapsed < 1000) {
      await new Promise<void>((r) => setTimeout(r, 1000 - elapsed))
    }
    loading.value = false

    if (visResult.isErr()) { error.value = visResult.error.message; return }
    if (hidResult.isErr()) { error.value = hidResult.error.message; return }

    _byAccount.value = {
      ..._byAccount.value,
      [id]: {
        visible: [...visResult.value.signals].sort(byReceivedDesc),
        hidden: [...hidResult.value.signals].sort(byReceivedDesc),
      },
    }
    _cursors.value = {
      ..._cursors.value,
      [id]: {
        visible: visResult.value.pagination.cursor ?? undefined,
        hidden: hidResult.value.pagination.cursor ?? undefined,
      },
    }
  }

  // Exhaust all visible pages before moving to hidden pages.
  async function fetchMore() {
    const id = accountStore.accountId
    if (!id || !hasMore.value || loadingMore.value) return
    loadingMore.value = true

    const d = _data(id)
    const c = _cursors.value[id]

    if (c?.visible) {
      const result = await api.listQuarantinedSignals(
        id,
        'quarantine_visible',
        buildParams(c.visible),
      )
      loadingMore.value = false
      if (result.isErr()) { error.value = result.error.message; return }
      _byAccount.value = {
        ..._byAccount.value,
        [id]: {
          ...d,
          visible: [...d.visible, ...result.value.signals].sort(byReceivedDesc),
        },
      }
      _cursors.value = {
        ..._cursors.value,
        [id]: {
          ...c,
          visible: result.value.pagination.cursor ?? undefined,
        },
      }
    } else if (c?.hidden) {
      const result = await api.listQuarantinedSignals(
        id,
        'quarantine_hidden',
        buildParams(c.hidden),
      )
      loadingMore.value = false
      if (result.isErr()) { error.value = result.error.message; return }
      _byAccount.value = {
        ..._byAccount.value,
        [id]: {
          ...d,
          hidden: [...d.hidden, ...result.value.signals].sort(byReceivedDesc),
        },
      }
      _cursors.value = {
        ..._cursors.value,
        [id]: {
          ...c,
          hidden: result.value.pagination.cursor ?? undefined,
        },
      }
    } else {
      loadingMore.value = false
    }
  }

  function _removeSignal(id: string, signalId: string) {
    const d = _data(id)
    _byAccount.value = {
      ..._byAccount.value,
      [id]: {
        visible: d.visible.filter((x) => x.signalId !== signalId),
        hidden: d.hidden.filter((x) => x.signalId !== signalId),
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

  function setFilters(next: Partial<QuarantineFilters>) {
    filters.value = { ...filters.value, ...next }
  }

  function clearError() {
    error.value = null
  }

  return {
    quarantineVisible,
    quarantineHidden,
    visibleCount,
    visibleCountHasMore,
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
    setFilters,
    clearError,
  }
}, {
  persist: {
    accountKeyedRef: '_byAccount',
  },
})
