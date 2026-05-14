import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import type { Signal, Arc } from '@/types/server'

export const useSignalsStore = defineStore('signals', () => {
  const accountStore = useAccountStore()

  const items = ref<Signal[]>([])
  const arc = ref<Arc | null>(null)
  const nextCursor = ref<string | undefined>(undefined)
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)

  const hasMore = computed(() => !!nextCursor.value)
  const latestSignal = computed(() => items.value[0] ?? null)

  async function fetchAll(arcId: string) {
    const accountId = accountStore.accountId
    if (!accountId) return
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
    loading.value = false
  }

  async function fetchMore(arcId: string) {
    const accountId = accountStore.accountId
    if (!accountId || !nextCursor.value || loadingMore.value) return
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

  async function createDraft(arcId: string): Promise<boolean> {
    const accountId = accountStore.accountId
    if (!accountId) return false
    // Use the latest non-draft signal as the reply target
    const replyTo = items.value.find((s) => s.status !== 'draft') ?? items.value[0]
    const result = await api.createDraftSignal(accountId, {
      status: 'draft',
      source: 'user',
      from: { address: '' },
      to: replyTo ? [{ address: replyTo.from.address }] : [],
      subject: replyTo ? `Re: ${replyTo.subject}` : '',
      arcId,
    })
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    // Drafts appear at the bottom of the thread (below received signals)
    items.value = [...items.value, result.value]
    return true
  }

  function removeSignal(signalId: string) {
    items.value = items.value.filter((s) => s.id !== signalId)
  }

  async function archiveArc(arcId: string) {
    const accountId = accountStore.accountId
    if (!accountId) return false
    const result = await api.patchArc(accountId, arcId, { status: 'archived' })
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    arc.value = result.value
    return true
  }

  async function labelArc(arcId: string, label: string) {
    const accountId = accountStore.accountId
    if (!accountId) return false
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
    loading.value = false
    loadingMore.value = false
    error.value = null
  }

  return {
    items,
    arc,
    nextCursor,
    loading,
    loadingMore,
    error,
    hasMore,
    latestSignal,
    fetchAll,
    fetchMore,
    createDraft,
    removeSignal,
    archiveArc,
    labelArc,
    reset,
  }
})
