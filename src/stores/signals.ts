import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { ok, err, type Result } from 'neverthrow'
import { api, ApiError } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import { NoCurrentAccountError } from '@/stores/errors'
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
    items.value = [...signalsResult.value.signals].reverse()
    nextCursor.value = signalsResult.value.pagination.cursor ?? undefined
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
      items.value = [...result.value.signals, ...items.value]
      nextCursor.value = result.value.pagination.cursor ?? undefined
    }

    loadingMore.value = false
  }

  async function createDraft(arcId: string): Promise<Result<Signal, ApiError | NoCurrentAccountError>> {
    const accountId = accountStore.accountId
    if (!accountId) return err(new NoCurrentAccountError())
    // Use the latest non-draft signal as the reply target
    const replyTo = items.value.find((s) => s.status !== 'draft') ?? items.value[0]
    const replyToAddress = replyTo && replyTo.type === 'email' ? replyTo.data.from.address : ''
    const replyToSubject = replyTo && replyTo.type === 'email' ? replyTo.data.subject : ''
    const result = await api.createDraftSignal(accountId, arcId, {
      from: { address: '' },
      to: replyToAddress ? [{ address: replyToAddress }] : [],
      subject: replyToSubject ? `Re: ${replyToSubject}` : '',
    })
    if (result.isErr()) {
      error.value = result.error.message
      return err(result.error)
    }
    // Drafts appear at the bottom of the thread (below received signals)
    items.value = [...items.value, result.value]
    return ok(result.value)
  }

  function removeSignal(signalId: string) {
    items.value = items.value.filter((s) => s.signalId !== signalId)
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
    reset,
  }
})
