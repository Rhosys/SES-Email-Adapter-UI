import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import logger from '@/lib/logger'
import { useAccountStore } from '@/stores/account'
import type { Signal } from '@/types/server'

function byCreatedDesc(a: Signal, b: Signal) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

export const useDraftsStore = defineStore('drafts', () => {
  const accountStore = useAccountStore()

  const _byAccount = ref<Record<string, Signal[]>>({})
  const _cursors = ref<Record<string, string | undefined>>({})
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)

  // Sidebar notification badge — derived from persisted data (no separate fetch needed).
  const draftCount = computed(() => {
    const id = accountStore.accountId
    if (!id) return 0
    return (_byAccount.value[id] ?? []).length
  })

  const draftCountHasMore = computed(() => {
    const id = accountStore.accountId
    if (!id) return false
    return _cursors.value[id] !== undefined
  })

  const drafts = computed<Signal[]>(() => {
    const id = accountStore.accountId
    if (!id) return []
    return [...(_byAccount.value[id] ?? [])].sort(byCreatedDesc)
  })

  const nextCursor = computed<string | undefined>(() =>
    accountStore.accountId ? _cursors.value[accountStore.accountId] : undefined,
  )

  const hasMore = computed(() => nextCursor.value !== undefined)

  async function fetchDrafts(reset = false) {
    const id = accountStore.accountId
    if (!id) return
    const hasCachedData = (_byAccount.value[id] ?? []).length > 0
    if (reset) {
      _cursors.value = { ..._cursors.value, [id]: undefined }
    }
    loading.value = !hasCachedData
    error.value = null
    const result = await api.listDraftSignals(id, { limit: 50 })
    loading.value = false
    if (result.isErr()) {
      if ((_byAccount.value[id] ?? []).length > 0) {
        logger.warn({ title: 'Drafts fetch failed with cache available', error: result.error.message })
      } else {
        error.value = result.error.message
      }
      return
    }
    _byAccount.value = { ..._byAccount.value, [id]: result.value.signals }
    _cursors.value = { ..._cursors.value, [id]: result.value.pagination.cursor ?? undefined }
  }

  async function fetchMoreDrafts() {
    const id = accountStore.accountId
    if (!id || !hasMore.value || loadingMore.value) return
    loadingMore.value = true
    const result = await api.listDraftSignals(id, { cursor: nextCursor.value, limit: 50 })
    loadingMore.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    const existing = _byAccount.value[id] ?? []
    _byAccount.value = { ..._byAccount.value, [id]: [...existing, ...result.value.signals] }
    _cursors.value = { ..._cursors.value, [id]: result.value.pagination.cursor ?? undefined }
  }

  function removeDraft(signalId: string) {
    const id = accountStore.accountId
    if (!id) return
    _byAccount.value = {
      ..._byAccount.value,
      [id]: (_byAccount.value[id] ?? []).filter((s) => s.signalId !== signalId),
    }
  }

  function clearError() {
    error.value = null
  }

  return {
    drafts,
    draftCount,
    draftCountHasMore,
    hasMore,
    loading,
    loadingMore,
    error,
    fetchDrafts,
    fetchMoreDrafts,
    removeDraft,
    clearError,
  }
}, {
  persist: {
    accountKeyedRef: '_byAccount',
  },
})
