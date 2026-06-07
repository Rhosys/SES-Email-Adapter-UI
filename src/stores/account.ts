import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ok, err, type Result } from 'neverthrow'
import { api, ApiError } from '@/lib/api'
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

  // The in-flight fetch promise — guards can await this without initiating their own fetch
  let pendingFetch: Promise<void> | null = null

  const accountId = computed(() => account.value?.accountId ?? null)

  // fromAccountId: explicit override (e.g. from ?accountId= query param)
  async function fetchAccount(fromAccountId?: string) {
    loading.value = true
    error.value = null
    const result = await api.listAccounts()
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    accounts.value = result.value

    const preferred =
      fromAccountId ?? sessionStorage.getItem(TAB_KEY) ?? localStorage.getItem(LAST_KEY) ?? null

    account.value =
      (preferred ? (accounts.value.find((a) => a.accountId === preferred) ?? null) : null) ??
      accounts.value[0] ??
      null

    if (account.value) sessionStorage.setItem(TAB_KEY, account.value.accountId)
  }

  /** Fire-and-forget: starts fetchAccount and stores the promise for guards to await. */
  function startFetch(fromAccountId?: string) {
    pendingFetch = fetchAccount(fromAccountId)
  }

  /** Await the in-flight fetch (if any). If the fetch hasn't started yet, waits briefly for it to begin. */
  async function waitForFetch() {
    // The fetch is kicked off by main.ts after waitForUserSession resolves.
    // In rare cases the guard may reach here before the .then() microtask fires — yield once.
    if (!pendingFetch) await Promise.resolve()
    if (pendingFetch) await pendingFetch
  }

  async function createAccount(name: string): Promise<Result<Account, ApiError>> {
    loading.value = true
    error.value = null
    const result = await api.createAccount({ name })
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return err(result.error)
    }
    const newAccount = result.value
    accounts.value = [newAccount, ...accounts.value]
    account.value = newAccount
    sessionStorage.setItem(TAB_KEY, newAccount.accountId)
    localStorage.setItem(LAST_KEY, newAccount.accountId)
    return ok(newAccount)
  }

  function switchAccount(id: string) {
    const target = accounts.value.find((a) => a.accountId === id)
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
    fetchAccount,
    startFetch,
    waitForFetch,
    createAccount,
    switchAccount,
  }
})
