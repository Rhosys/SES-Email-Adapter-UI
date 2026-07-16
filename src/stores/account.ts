import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ok, err, type Result } from 'neverthrow'
import { api, ApiError } from '@/lib/api'
import { removeAllForAccount } from '@/plugins/persistent-store'
import logger from '@/lib/logger'
import type { Account } from '@/types/server'

// Per-tab account (sessionStorage — isolated per tab, copied on Ctrl+click)
const TAB_KEY = 'ses:tabAccountId'
// Last-used account across sessions (localStorage — fallback for fresh tabs)
const LAST_KEY = 'ses:lastAccountId'

// Cached accounts list, so a returning user can render the shell optimistically
// before the /accounts revalidation completes. Uses the `ses:v1:` prefix so sign-out's
// clearAllPersistedCache() wipes it too; the 3-segment key is deliberately shorter than
// the per-account cache keys, so fetchAccount's stale-account cleanup (which requires a
// 4th segment) never mistakes it for a revoked account.
const ACCOUNTS_CACHE_KEY = 'ses:v1:accounts'
const ACCOUNTS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface AccountsCacheEnvelope {
  data: Account[]
  writtenAt: number
}

function readAccountsCache(): Account[] | undefined {
  try {
    const raw = localStorage.getItem(ACCOUNTS_CACHE_KEY)
    if (!raw) return undefined
    const envelope = JSON.parse(raw) as AccountsCacheEnvelope
    if (!envelope.writtenAt || Date.now() - envelope.writtenAt > ACCOUNTS_CACHE_MAX_AGE_MS) {
      localStorage.removeItem(ACCOUNTS_CACHE_KEY)
      return undefined
    }
    return Array.isArray(envelope.data) ? envelope.data : undefined
  } catch (e) {
    logger.warn({ title: 'Failed to read cached accounts list', error: e })
    return undefined
  }
}

function writeAccountsCache(list: Account[]): void {
  try {
    localStorage.setItem(ACCOUNTS_CACHE_KEY, JSON.stringify({ data: list, writtenAt: Date.now() }))
  } catch (e) {
    logger.warn({ title: 'Failed to cache accounts list', error: e })
  }
}

/** Choose the active account from a list using the same tab/last-used preference order. */
function pickPreferred(list: Account[], fromAccountId?: string): Account | null {
  const preferred =
    fromAccountId ?? sessionStorage.getItem(TAB_KEY) ?? localStorage.getItem(LAST_KEY) ?? null
  return (
    (preferred ? (list.find((a) => a.accountId === preferred) ?? null) : null) ?? list[0] ?? null
  )
}

export const useAccountStore = defineStore('account', () => {
  // Hydrate synchronously from the cached accounts list (if any) so the first paint —
  // and the router's onboarding guard — can proceed without waiting on the network.
  const cachedAccounts = readAccountsCache()
  const account = ref<Account | null>(cachedAccounts ? pickPreferred(cachedAccounts) : null)
  const accounts = ref<Account[]>(cachedAccounts ?? [])
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

    // Clean up localStorage cache for accounts the user no longer has access to
    try {
      const validIds = new Set(result.value.map((a) => a.accountId))
      const cachedAccountIds = new Set<string>()
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('ses:v1:')) {
          const parts = key.split(':')
          if (parts.length >= 4) {
            cachedAccountIds.add(parts[2])
          }
        }
      }
      for (const cachedId of cachedAccountIds) {
        if (!validIds.has(cachedId)) {
          removeAllForAccount(cachedId)
          logger.info({ title: 'Removed cache for revoked account', accountId: cachedId })
        }
      }
    } catch (e) {
      logger.warn({ title: 'Failed to clean up stale account cache', error: e })
    }

    account.value = pickPreferred(accounts.value, fromAccountId)

    if (account.value) sessionStorage.setItem(TAB_KEY, account.value.accountId)

    // Refresh the optimistic-hydration cache with the authoritative list.
    writeAccountsCache(accounts.value)
  }

  /** Fire-and-forget: starts fetchAccount and stores the promise for guards to await. */
  function startFetch(fromAccountId?: string) {
    pendingFetch = fetchAccount(fromAccountId)
  }

  /** Await the in-flight fetch (if any). If the fetch hasn't started yet, waits briefly for it to begin. */
  async function waitForFetch() {
    // The fetch is kicked off by main.ts at startup (startFetch runs right after mount).
    // In rare cases the guard may reach here before that line runs — yield once.
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
    writeAccountsCache(accounts.value)
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
