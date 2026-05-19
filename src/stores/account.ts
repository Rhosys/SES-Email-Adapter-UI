import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import type { Account } from '@/types/server'

// Per-tab account (sessionStorage — isolated per tab, copied on Ctrl+click)
const TAB_KEY = 'ses:tabAccountId'
// Last-used account across sessions (localStorage — fallback for fresh tabs)
const LAST_KEY = 'ses:lastAccountId'

export const useAccountStore = defineStore('account', () => {
  const account = ref<Account | null>(null)
  const accounts = ref<Account[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const fetched = ref(false)

  const accountId = computed(() => account.value?.id ?? null)

  // fromAccountId: explicit override (e.g. from ?accountId= query param)
  async function fetchAccount(fromAccountId?: string) {
    loading.value = true
    error.value = null
    const result = await api.listAccounts()
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      fetched.value = true
      return
    }
    accounts.value = result.value

    const preferred =
      fromAccountId ?? sessionStorage.getItem(TAB_KEY) ?? localStorage.getItem(LAST_KEY) ?? null

    account.value =
      (preferred ? (accounts.value.find((a) => a.id === preferred) ?? null) : null) ??
      accounts.value[0] ??
      null

    if (account.value) sessionStorage.setItem(TAB_KEY, account.value.id)
    fetched.value = true
  }

  async function createAccount(name: string): Promise<boolean> {
    loading.value = true
    error.value = null
    const result = await api.createAccount({ name })
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return false
    }
    const newAccount = result.value
    accounts.value = [newAccount, ...accounts.value]
    account.value = newAccount
    fetched.value = true
    sessionStorage.setItem(TAB_KEY, newAccount.id)
    localStorage.setItem(LAST_KEY, newAccount.id)
    return true
  }

  function switchAccount(id: string) {
    const target = accounts.value.find((a) => a.id === id)
    if (!target) return
    sessionStorage.setItem(TAB_KEY, id)
    localStorage.setItem(LAST_KEY, id)
    account.value = target
    // Full reload flushes all per-account store caches for this tab
    window.location.assign('/')
  }

  return {
    account,
    accounts,
    loading,
    error,
    accountId,
    fetched,
    fetchAccount,
    createAccount,
    switchAccount,
  }
})
