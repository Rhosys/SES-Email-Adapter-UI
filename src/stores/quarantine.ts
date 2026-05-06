import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'
import type { ArcListParams } from '@/lib/api'
import type { Arc, CreateRuleBody } from '@/types/server'
import { useAccountStore } from '@/stores/account'

export interface QuarantineFilters {
  sender: string
  after: string
  before: string
}

export const useQuarantineStore = defineStore('quarantine', () => {
  const items = ref<Arc[]>([])
  const nextCursor = ref<string | undefined>()
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const actionPending = ref<Set<string>>(new Set())

  const filters = ref<QuarantineFilters>({
    sender: '',
    after: '',
    before: '',
  })

  function buildParams(cursor?: string): ArcListParams {
    const p: ArcListParams = { status: 'quarantined', limit: 50 }
    if (filters.value.sender) p.sender = filters.value.sender
    if (filters.value.after) p.after = filters.value.after
    if (filters.value.before) p.before = filters.value.before
    if (cursor) p.cursor = cursor
    return p
  }

  async function fetchArcs(accountId: string, reset = false) {
    if (reset) {
      items.value = []
      nextCursor.value = undefined
    }
    loading.value = true
    error.value = null
    const result = await api.listArcs(accountId, buildParams())
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    items.value = result.value.items
    nextCursor.value = result.value.nextCursor
  }

  async function fetchMore(accountId: string) {
    if (!nextCursor.value || loadingMore.value) return
    loadingMore.value = true
    const result = await api.listArcs(accountId, buildParams(nextCursor.value))
    loadingMore.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    items.value = [...items.value, ...result.value.items]
    nextCursor.value = result.value.nextCursor
  }

  async function allowSender(accountId: string, arcId: string) {
    const arc = items.value.find((a) => a.id === arcId)
    if (!arc?.senderAddress || !arc?.recipientAddress) {
      error.value = 'Missing sender or recipient address on arc'
      return false
    }
    const accountStore = useAccountStore()
    const aliasConfig = accountStore.account?.emailConfigs?.[arc.recipientAddress]
    const currentApproved = aliasConfig?.approvedSenders ?? []

    actionPending.value.add(arcId)
    const result = await api.allowSender(
      accountId,
      arc.recipientAddress,
      arc.senderAddress,
      currentApproved,
    )
    actionPending.value.delete(arcId)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    items.value = items.value.filter((a) => a.id !== arcId)
    return true
  }

  async function blockSender(accountId: string, arcId: string) {
    const arc = items.value.find((a) => a.id === arcId)
    if (!arc?.senderAddress || !arc?.recipientAddress) {
      error.value = 'Missing sender or recipient address on arc'
      return false
    }
    const accountStore = useAccountStore()
    const aliasConfig = accountStore.account?.emailConfigs?.[arc.recipientAddress]
    const currentBlocked = aliasConfig?.blockedSenders ?? []

    actionPending.value.add(arcId)
    const result = await api.blockSender(
      accountId,
      arc.recipientAddress,
      arc.senderAddress,
      currentBlocked,
    )
    actionPending.value.delete(arcId)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    items.value = items.value.filter((a) => a.id !== arcId)
    return true
  }

  async function createRuleForArc(accountId: string, arcId: string, body: CreateRuleBody) {
    actionPending.value.add(arcId)
    const result = await api.createRule(accountId, body)
    actionPending.value.delete(arcId)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    items.value = items.value.filter((a) => a.id !== arcId)
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
    nextCursor,
    loading,
    loadingMore,
    error,
    actionPending,
    filters,
    fetchArcs,
    fetchMore,
    allowSender,
    blockSender,
    createRuleForArc,
    setFilters,
    clearError,
  }
})
