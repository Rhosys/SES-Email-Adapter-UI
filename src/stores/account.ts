import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import { loginClient } from '@/lib/auth'
import type { Account } from '@/types/server'

export const useAccountStore = defineStore('account', () => {
  const account = ref<Account | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const accountId = computed(() => account.value?.id ?? null)

  async function fetchAccount() {
    const identity = loginClient.getUserIdentity()
    const sub = (identity as Record<string, unknown>)['sub'] as string
    loading.value = true
    error.value = null
    const result = await api.getAccount(sub)
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    account.value = result.value
  }

  return { account, loading, error, accountId, fetchAccount }
})
