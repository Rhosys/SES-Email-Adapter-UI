import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'
import type { CreateRuleBody, Rule, UpdateRuleBody } from '@/types/server'

export const useRulesStore = defineStore('rules', () => {
  const items = ref<Rule[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const savePending = ref(false)

  async function fetchRules(accountId: string) {
    loading.value = true
    error.value = null
    const result = await api.listRules(accountId)
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    items.value = result.value
  }

  async function createRule(accountId: string, body: CreateRuleBody): Promise<Rule | null> {
    savePending.value = true
    error.value = null
    const result = await api.createRule(accountId, body)
    savePending.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return null
    }
    items.value = [...items.value, result.value]
    return result.value
  }

  async function updateRule(
    accountId: string,
    ruleId: string,
    body: UpdateRuleBody,
  ): Promise<Rule | null> {
    savePending.value = true
    error.value = null
    const result = await api.updateRule(accountId, ruleId, body)
    savePending.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return null
    }
    items.value = items.value.map((r) => (r.id === ruleId ? result.value : r))
    return result.value
  }

  async function deleteRule(accountId: string, ruleId: string): Promise<boolean> {
    const result = await api.deleteRule(accountId, ruleId)
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    items.value = items.value.filter((r) => r.id !== ruleId)
    return true
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
    clearError,
  }
})
