import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import logger from '@/lib/logger'
import { useAccountStore } from '@/stores/account'
import type { QuarantineSignalListParams } from '@/lib/api'
import type { BlockedSignal } from '@/types/server'

export interface SpamFilters {
  sender: string
  after: string
  before: string
}

interface SpamData {
  hidden: BlockedSignal[]
  reject: BlockedSignal[]
}

function byReceivedDesc(a: BlockedSignal, b: BlockedSignal) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

export const useSpamStore = defineStore('spam', () => {
  const accountStore = useAccountStore()

  const _byAccount = ref<Record<string, SpamData>>({})
  const _cursors = ref<Record<string, { hidden?: string; reject?: string }>>({})
  const loadingMore = ref(false)
  const error = ref<string | null>(null)

  const filters = ref<SpamFilters>({
    sender: '',
    after: '',
    before: '',
  })

  function _data(id: string): SpamData {
    const raw = _byAccount.value[id]
    if (!raw) return { hidden: [], reject: [] }
    return {
      hidden: Array.isArray(raw.hidden) ? raw.hidden : [],
      reject: Array.isArray(raw.reject) ? raw.reject : [],
    }
  }

  const blockHidden = computed<BlockedSignal[]>(() =>
    accountStore.accountId ? _data(accountStore.accountId).hidden : [],
  )

  const blockReject = computed<BlockedSignal[]>(() =>
    accountStore.accountId ? _data(accountStore.accountId).reject : [],
  )

  const hasMore = computed(() => {
    if (!accountStore.accountId) return false
    const c = _cursors.value[accountStore.accountId]
    return !!(c?.hidden || c?.reject)
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
      const { [id]: _, ...rest } = _cursors.value
      _cursors.value = rest
    }
    error.value = null

    const [hidResult, rejResult] = await Promise.all([
      api.listBlockedSignals(id, 'block_hidden', buildParams()),
      api.listBlockedSignals(id, 'block_reject', buildParams()),
    ])

    if (hidResult.isErr()) {
      const hasCached = (_byAccount.value[id]?.hidden.length ?? 0) > 0
      if (hasCached) {
        logger.warn({ title: 'Spam fetch failed with cache available', error: hidResult.error.message })
        return
      }
      error.value = hidResult.error.message
      return
    }
    if (rejResult.isErr()) {
      const hasCached = (_byAccount.value[id]?.reject.length ?? 0) > 0
      if (hasCached) {
        logger.warn({ title: 'Spam fetch failed with cache available', error: rejResult.error.message })
        return
      }
      error.value = rejResult.error.message
      return
    }

    _byAccount.value = {
      ..._byAccount.value,
      [id]: {
        hidden: [...hidResult.value.signals].sort(byReceivedDesc),
        reject: [...rejResult.value.signals].sort(byReceivedDesc),
      },
    }
    _cursors.value = {
      ..._cursors.value,
      [id]: {
        hidden: hidResult.value.pagination.cursor ?? undefined,
        reject: rejResult.value.pagination.cursor ?? undefined,
      },
    }
  }

  async function fetchMore() {
    const id = accountStore.accountId
    if (!id || !hasMore.value || loadingMore.value) return
    loadingMore.value = true

    const d = _data(id)
    const c = _cursors.value[id]

    if (c?.hidden) {
      const result = await api.listBlockedSignals(id, 'block_hidden', buildParams(c.hidden))
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
        [id]: { ...c, hidden: result.value.pagination.cursor ?? undefined },
      }
    } else if (c?.reject) {
      const result = await api.listBlockedSignals(id, 'block_reject', buildParams(c.reject))
      loadingMore.value = false
      if (result.isErr()) { error.value = result.error.message; return }
      _byAccount.value = {
        ..._byAccount.value,
        [id]: {
          ...d,
          reject: [...d.reject, ...result.value.signals].sort(byReceivedDesc),
        },
      }
      _cursors.value = {
        ..._cursors.value,
        [id]: { ...c, reject: result.value.pagination.cursor ?? undefined },
      }
    } else {
      loadingMore.value = false
    }
  }

  function setFilters(next: Partial<SpamFilters>) {
    filters.value = { ...filters.value, ...next }
  }

  function clearError() {
    error.value = null
  }

  return {
    blockHidden,
    blockReject,
    hasMore,
    loadingMore,
    error,
    filters,
    fetchSignals,
    fetchMore,
    setFilters,
    clearError,
  }
}, {
  persist: {
    accountKeyedRef: '_byAccount',
  },
})
