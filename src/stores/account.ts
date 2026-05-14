import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import type { Account } from '@/types/server'

const ACCOUNT_KEY = 'ses:accountId'

export const useAccountStore = defineStore('account', () => {
  const account = ref<Account | null>(null)
  const accounts = ref<Account[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const accountId = computed(() => account.value?.id ?? null)

  async function fetchAccount() {
    loading.value = true
    error.value = null
    const result = await api.listAccounts()
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    accounts.value = result.value
    const storedId = localStorage.getItem(ACCOUNT_KEY)
    account.value = accounts.value.find((a) => a.id === storedId) ?? accounts.value[0] ?? null
  }

  function switchAccount(id: string) {
    const target = accounts.value.find((a) => a.id === id)
    if (!target) return
    localStorage.setItem(ACCOUNT_KEY, id)
    account.value = target
    window.location.assign('/')
  }

  return { account, accounts, loading, error, accountId, fetchAccount, switchAccount }
})
