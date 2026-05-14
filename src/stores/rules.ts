import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
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

  async function createRule(body: CreateRuleBody): Promise<Rule | null> {
    const id = accountStore.accountId
    if (!id) return null
    savePending.value = true
    error.value = null
    const result = await api.createRule(id, body)
    savePending.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return null
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: [...(_byAccount.value[id] ?? []), result.value],
    }
    return result.value
  }

  async function updateRule(ruleId: string, body: UpdateRuleBody): Promise<Rule | null> {
    const id = accountStore.accountId
    if (!id) return null
    savePending.value = true
    error.value = null
    const result = await api.updateRule(id, ruleId, body)
    savePending.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return null
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: (_byAccount.value[id] ?? []).map((r) => (r.id === ruleId ? result.value : r)),
    }
    return result.value
  }

  async function deleteRule(ruleId: string): Promise<boolean> {
    const id = accountStore.accountId
    if (!id) return false
    const result = await api.deleteRule(id, ruleId)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: (_byAccount.value[id] ?? []).filter((r) => r.id !== ruleId),
    }
    return true
  }

  async function moveRule(ruleId: string, direction: -1 | 1): Promise<void> {
    const id = accountStore.accountId
    if (!id) return
    const list = [...(_byAccount.value[id] ?? [])]
    const idx = list.findIndex((r) => r.id === ruleId)
    const swapIdx = idx + direction
    if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return

    const a = list[idx]
    const b = list[swapIdx]
    const [resA, resB] = await Promise.all([
      api.updateRule(id, a.id, { priorityOrder: b.priorityOrder }),
      api.updateRule(id, b.id, { priorityOrder: a.priorityOrder }),
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
    clearError,
  }
})
