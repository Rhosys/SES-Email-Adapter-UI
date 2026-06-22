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

  const _byAccount = ref<Record<string, Signal[]>>({})
  const nextCursor = ref<string | undefined>(undefined)
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)

  const items = computed<Signal[]>(() => accountStore.accountId ? (_byAccount.value[accountStore.accountId] ?? []) : [])
  const hasMore = computed(() => !!nextCursor.value)
  const latestSignal = computed(() => items.value[0] ?? null)

  async function fetchAll(arcId: string) {
    const accountId = accountStore.accountId
    if (!accountId) return
    loading.value = (_byAccount.value[accountId] ?? []).length === 0
    error.value = null

    const signalsResult = await api.listSignals(accountId, arcId, { limit: 50 })

    if (signalsResult.isErr()) {
      if ((_byAccount.value[accountId] ?? []).length > 0) {
        logger.warn({ title: 'Signals fetch failed with cache available', error: signalsResult.error.message })
        loading.value = false
        return
      }
      error.value = signalsResult.error.message
      loading.value = false
      return
    }

    const fresh = [...signalsResult.value.signals].reverse()
    const cached = _byAccount.value[accountId] ?? []

    if (cached.length === 0) {
      _byAccount.value = { ..._byAccount.value, [accountId]: fresh }
    } else {
      const freshIds = new Set(fresh.map(s => s.signalId))
      const olderCached = cached.filter(s => !freshIds.has(s.signalId))
      _byAccount.value = { ..._byAccount.value, [accountId]: [...fresh, ...olderCached] }
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
      _byAccount.value = { ..._byAccount.value, [accountId]: [...(_byAccount.value[accountId] ?? []), ...[...result.value.signals].reverse()] }
      nextCursor.value = result.value.pagination.cursor ?? undefined
    }

    loadingMore.value = false
  }

  async function createDraft(arcId: string): Promise<Result<Signal, ApiError | NoCurrentAccountError>> {
    const accountId = accountStore.accountId
    if (!accountId) return err(new NoCurrentAccountError())
    // Use the latest non-draft signal as the reply target
    const replyTo = items.value.find((s) => s.status !== 'draft') ?? items.value[0]

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
    // items is newest-first; a new draft reply is the newest item
    _byAccount.value = { ..._byAccount.value, [accountId]: [result.value, ...(_byAccount.value[accountId] ?? [])] }
    return ok(result.value)
  }

  function removeSignal(signalId: string) {
    const accountId = accountStore.accountId
    if (!accountId) return
    _byAccount.value = { ..._byAccount.value, [accountId]: (_byAccount.value[accountId] ?? []).filter((s) => s.signalId !== signalId) }
  }

  function reset() {
    _byAccount.value = {}
    nextCursor.value = undefined
    loading.value = false
    loadingMore.value = false
    error.value = null
  }

  return {
    _byAccount,
    items,
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
}, {
  persist: {
    accountKeyedRef: '_byAccount',
  },
})
