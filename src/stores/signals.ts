import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/lib/api'
import type { Signal, Arc } from '@/types/server'

export const useSignalsStore = defineStore('signals', () => {
  const items = ref<Signal[]>([])
  const arc = ref<Arc | null>(null)
  const nextCursor = ref<string | undefined>(undefined)
  const total = ref(0)
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)

  const hasMore = computed(() => !!nextCursor.value)
  const latestSignal = computed(() => items.value[0] ?? null)

  async function fetchAll(accountId: string, arcId: string) {
    loading.value = true
    error.value = null

    const [arcResult, signalsResult] = await Promise.all([
      api.getArc(accountId, arcId),
      api.listSignals(accountId, arcId, { limit: 50 }),
    ])

    if (arcResult.isErr()) {
      error.value = arcResult.error.message
      loading.value = false
      return
    }

    if (signalsResult.isErr()) {
      error.value = signalsResult.error.message
      loading.value = false
      return
    }

    arc.value = arcResult.value
    // Newest first
    items.value = [...signalsResult.value.items].reverse()
    nextCursor.value = signalsResult.value.nextCursor
    total.value = signalsResult.value.total
    loading.value = false
  }

  async function fetchMore(accountId: string, arcId: string) {
    if (!nextCursor.value || loadingMore.value) return
    loadingMore.value = true

    const result = await api.listSignals(accountId, arcId, {
      cursor: nextCursor.value,
      limit: 50,
    })

    if (result.isErr()) {
      error.value = result.error.message
    } else {
      // Prepend older signals (they come in chronological order, we show newest-first)
      items.value = [...result.value.items, ...items.value]
      nextCursor.value = result.value.nextCursor
    }

    loadingMore.value = false
  }

  async function archiveArc(accountId: string, arcId: string) {
    const result = await api.patchArc(accountId, arcId, { status: 'archived' })
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    arc.value = result.value
    return true
  }

  async function labelArc(accountId: string, arcId: string, label: string) {
    if (!arc.value) return false
    const existing = arc.value.labels ?? []
    if (existing.includes(label)) return true
    const result = await api.patchArc(accountId, arcId, { labels: [...existing, label] })
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    arc.value = result.value
    return true
  }

  function reset() {
    items.value = []
    arc.value = null
    nextCursor.value = undefined
    total.value = 0
    loading.value = false
    loadingMore.value = false
    error.value = null
  }

  return {
    items,
    arc,
    nextCursor,
    total,
    loading,
    loadingMore,
    error,
    hasMore,
    latestSignal,
    fetchAll,
    fetchMore,
    archiveArc,
    labelArc,
    reset,
  }
})
