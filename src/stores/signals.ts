import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { ok, err, type Result } from 'neverthrow'
import { api, ApiError } from '@/lib/api'
import logger from '@/lib/logger'
import { useAccountStore } from '@/stores/account'
import { NoCurrentAccountError } from '@/stores/errors'
import type { Signal } from '@/types/server'

export const useSignalsStore = defineStore('signals', () => {
  const accountStore = useAccountStore()

  // accountId -> arcId -> signals (newest first). Keyed by arcId (not just
  // accountId) so signals for many arcs can be cached at once — this backs
  // cross-arc derivations like the drafts indicator/list, which scan every
  // cached arc for draft signals instead of calling a dedicated endpoint.
  const _byAccount = ref<Record<string, Record<string, Signal[]>>>({})
  const currentArcId = ref<string | null>(null)
  const nextCursor = ref<string | undefined>(undefined)
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)

  function arcSignals(arcId: string): Signal[] {
    const accountId = accountStore.accountId
    if (!accountId) return []
    return _byAccount.value[accountId]?.[arcId] ?? []
  }

  function setArcSignals(arcId: string, signals: Signal[]) {
    const accountId = accountStore.accountId
    if (!accountId) return
    // Always enforce newest-first by createdAt — fetchAll's merge of fresh +
    // cached pages assumes that invariant, but locally-created signals
    // (drafts) or out-of-window pagination can otherwise land out of order.
    const sorted = [...signals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const forAccount = _byAccount.value[accountId] ?? {}
    _byAccount.value = { ..._byAccount.value, [accountId]: { ...forAccount, [arcId]: sorted } }
  }

  const items = computed<Signal[]>(() => (currentArcId.value ? arcSignals(currentArcId.value) : []))
  const hasMore = computed(() => !!nextCursor.value)
  const latestSignal = computed(() => items.value[0] ?? null)

  // Every signal cached for the current account, across all arcs.
  const allSignals = computed<Signal[]>(() => {
    const accountId = accountStore.accountId
    if (!accountId) return []
    return Object.values(_byAccount.value[accountId] ?? {}).flat()
  })

  async function fetchAll(arcId: string) {
    const accountId = accountStore.accountId
    if (!accountId) return
    currentArcId.value = arcId
    const cached = arcSignals(arcId)
    loading.value = cached.length === 0
    error.value = null

    const signalsResult = await api.listSignals(accountId, arcId, { limit: 50 })

    if (signalsResult.isErr()) {
      if (cached.length > 0) {
        logger.warn({ title: 'Signals fetch failed with cache available', error: signalsResult.error.message })
        loading.value = false
        return
      }
      error.value = signalsResult.error.message
      loading.value = false
      return
    }

    const fresh = [...signalsResult.value.signals].reverse()

    if (cached.length === 0) {
      setArcSignals(arcId, fresh)
    } else {
      const freshIds = new Set(fresh.map((s) => s.signalId))
      const olderCached = cached.filter((s) => !freshIds.has(s.signalId))
      setArcSignals(arcId, [...fresh, ...olderCached])
    }

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
      // Append older signals (API returns them chronologically; items are newest-first)
      setArcSignals(arcId, [...arcSignals(arcId), ...[...result.value.signals].reverse()])
      nextCursor.value = result.value.pagination.cursor ?? undefined
    }

    loadingMore.value = false
  }

  // Background refresh of several arcs at once — used by the Drafts page to
  // pull fresh signals for the most recently active arcs on load, so any
  // drafts hiding in them surface without a dedicated "list drafts" call.
  async function fetchForArcs(arcIds: string[]) {
    const accountId = accountStore.accountId
    if (!accountId) return
    await Promise.all(
      arcIds.map(async (arcId) => {
        const result = await api.listSignals(accountId, arcId, { limit: 50 })
        if (result.isOk()) {
          setArcSignals(arcId, [...result.value.signals].reverse())
        }
      }),
    )
  }

  async function createDraft(arcId: string): Promise<Result<Signal, ApiError | NoCurrentAccountError>> {
    const accountId = accountStore.accountId
    if (!accountId) return err(new NoCurrentAccountError())
    const existing = arcSignals(arcId)
    // Use the latest non-draft signal as the reply target
    const replyTo = existing.find((s) => s.status !== 'draft') ?? existing[0]

    let fromAddress = ''
    let toAddresses: { address: string }[] = []
    let replySubject = ''

    if (replyTo && replyTo.type === 'email' && 'recipientAddress' in replyTo.data) {
      const data = replyTo.data as { from: { address: string }; to: { address: string }[]; cc: { address: string }[]; recipientAddress: string; subject: string }
      const alias = data.recipientAddress?.toLowerCase() ?? ''

      // From: the alias we received the email on
      fromAddress = data.recipientAddress ?? ''

      // To: original sender + all original to + all cc — minus the alias
      const allRecipients = [
        { address: data.from.address },
        ...data.to,
        ...data.cc,
      ]
      const seen = new Set<string>()
      toAddresses = allRecipients.filter((a) => {
        const lower = a.address.toLowerCase()
        if (lower === alias || seen.has(lower)) return false
        seen.add(lower)
        return true
      })

      // Subject: "Re: " prefix unless already present
      const subj = data.subject ?? ''
      replySubject = /^re:\s/i.test(subj) ? subj : `Re: ${subj}`
    }

    const result = await api.createDraftSignal(accountId, arcId, {
      from: { address: fromAddress },
      to: toAddresses,
      subject: replySubject,
    })
    if (result.isErr()) {
      error.value = result.error.message
      return err(result.error)
    }
    // newest-first; a new draft reply is the newest item
    setArcSignals(arcId, [result.value, ...existing])
    return ok(result.value)
  }

  // Patches a single cached signal in place — keeps the shared cache (and the
  // derived drafts indicator/list) in sync with edits made outside this
  // store, e.g. draft autosave or send, which call the API directly.
  function updateSignal(arcId: string, signal: Signal) {
    const existing = arcSignals(arcId)
    const idx = existing.findIndex((s) => s.signalId === signal.signalId)
    if (idx === -1) return
    const updated = [...existing]
    updated[idx] = signal
    setArcSignals(arcId, updated)
  }

  function removeSignal(arcId: string, signalId: string) {
    setArcSignals(arcId, arcSignals(arcId).filter((s) => s.signalId !== signalId))
  }

  function reset() {
    currentArcId.value = null
    nextCursor.value = undefined
    loading.value = false
    loadingMore.value = false
    error.value = null
  }

  return {
    _byAccount,
    currentArcId,
    items,
    allSignals,
    nextCursor,
    loading,
    loadingMore,
    error,
    hasMore,
    latestSignal,
    fetchAll,
    fetchMore,
    fetchForArcs,
    createDraft,
    updateSignal,
    removeSignal,
    arcSignals,
    reset,
  }
}, {
  persist: {
    accountKeyedRef: '_byAccount',
  },
})
