import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ok, err, type Result } from 'neverthrow'
import { api, ApiError } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import { NoCurrentAccountError } from '@/stores/errors'
import type { CreateRuleBody, Rule, UpdateRuleBody } from '@/types/server'

export const useRulesStore = defineStore('rules', () => {
  const accountStore = useAccountStore()

  const _byAccount = ref<Record<string, Rule[]>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  const savePending = ref(false)

  const items = computed<Rule[]>(() =>
    accountStore.accountId ? (_byAccount.value[accountStore.accountId] ?? []) : [],
  )

  async function fetchRules() {
    const id = accountStore.accountId
    if (!id) return
    loading.value = true
    error.value = null
    const result = await api.listRules(id)
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    _byAccount.value = { ..._byAccount.value, [id]: result.value }
  }

  async function createRule(body: CreateRuleBody): Promise<Result<Rule, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    savePending.value = true
    error.value = null
    const result = await api.createRule(id, body)
    savePending.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return err(result.error)
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: [...(_byAccount.value[id] ?? []), result.value],
    }
    return ok(result.value)
  }

  async function updateRule(ruleId: string, body: UpdateRuleBody): Promise<Result<Rule, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    savePending.value = true
    error.value = null
    const result = await api.updateRule(id, ruleId, body)
    savePending.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return err(result.error)
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: (_byAccount.value[id] ?? []).map((r) => (r.ruleId === ruleId ? result.value : r)),
    }
    return ok(result.value)
  }

  async function deleteRule(ruleId: string): Promise<Result<void, ApiError | NoCurrentAccountError>> {
    const id = accountStore.accountId
    if (!id) return err(new NoCurrentAccountError())
    const result = await api.deleteRule(id, ruleId)
    if (result.isErr()) {
      error.value = result.error.message
      return err(result.error)
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: (_byAccount.value[id] ?? []).filter((r) => r.ruleId !== ruleId),
    }
    return ok(undefined)
  }

  async function moveRule(ruleId: string, direction: -1 | 1): Promise<void> {
    const id = accountStore.accountId
    if (!id) return
    const list = [...(_byAccount.value[id] ?? [])]
    const idx = list.findIndex((r) => r.ruleId === ruleId)
    const swapIdx = idx + direction
    if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return

    const a = list[idx]
    const b = list[swapIdx]
    const [resA, resB] = await Promise.all([
      api.updateRule(id, a.ruleId, { priorityOrder: b.priorityOrder }),
      api.updateRule(id, b.ruleId, { priorityOrder: a.priorityOrder }),
    ])
    if (resA.isErr()) {
      error.value = resA.error.message
      return
    }
    if (resB.isErr()) {
      error.value = resB.error.message
      return
    }

    list[idx] = resA.value
    list[swapIdx] = resB.value
    list.sort((x, y) => x.priorityOrder - y.priorityOrder)
    _byAccount.value = { ..._byAccount.value, [id]: list }
  }

  async function reorderRule(dragId: string, targetId: string): Promise<void> {
    if (dragId === targetId) return
    const id = accountStore.accountId
    if (!id) return
    const list = [...(_byAccount.value[id] ?? [])]
    const dragRule = list.find((r) => r.ruleId === dragId)
    const targetRule = list.find((r) => r.ruleId === targetId)
    if (!dragRule || !targetRule) return

    const [resA, resB] = await Promise.all([
      api.updateRule(id, dragId, { priorityOrder: targetRule.priorityOrder }),
      api.updateRule(id, targetId, { priorityOrder: dragRule.priorityOrder }),
    ])
    if (resA.isErr()) {
      error.value = resA.error.message
      return
    }
    if (resB.isErr()) {
      error.value = resB.error.message
      return
    }

    _byAccount.value = {
      ..._byAccount.value,
      [id]: list
        .map((r) => (r.ruleId === dragId ? resA.value : r.ruleId === targetId ? resB.value : r))
        .sort((a, b) => a.priorityOrder - b.priorityOrder),
    }
  }

  function clearError() {
    error.value = null
  }

  return {
    items,
    loading,
    error,
    savePending,
    fetchRules,
    createRule,
    updateRule,
    deleteRule,
    moveRule,
    reorderRule,
    clearError,
  }
})
