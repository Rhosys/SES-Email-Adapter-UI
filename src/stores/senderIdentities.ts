import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import type { Alias, Domain, ExternalMailExchange } from '@/types/server'

interface SenderIdentities {
  domains: Domain[]
  aliases: Alias[]
  exchanges: ExternalMailExchange[]
}

const EMPTY: SenderIdentities = { domains: [], aliases: [], exchanges: [] }

/**
 * Cache-first store for the identities an account can send email from — domains,
 * aliases, and connected external mailboxes. Consumers (the draft composer's From
 * picker, settings) read straight from `domains`/`aliases`/`exchanges`, which are
 * populated instantly from the persisted cache when one exists; `ensureLoaded`
 * kicks a background refresh without blocking whatever is already on screen.
 */
export const useSenderIdentitiesStore = defineStore('senderIdentities', () => {
  const accountStore = useAccountStore()

  const _byAccount = ref<Record<string, SenderIdentities>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  // Accounts a fetch has been kicked off for this session — separate from `loading`
  // so a second `ensureLoaded()` call while the first fetch is still in flight (or
  // after it already completed) is a no-op rather than a duplicate request.
  const fetchedAccounts = new Set<string>()

  const current = computed<SenderIdentities>(
    () => (accountStore.accountId && _byAccount.value[accountStore.accountId]) || EMPTY,
  )

  const domains = computed(() => current.value.domains)
  const aliases = computed(() => current.value.aliases)
  const exchanges = computed(() => current.value.exchanges)

  // True once this account has data — either hydrated from the persisted cache or
  // fetched this session — so callers can tell "known empty" from "not loaded yet".
  const hasData = computed(() => !!accountStore.accountId && accountStore.accountId in _byAccount.value)

  async function fetchAll() {
    const id = accountStore.accountId
    if (!id) return
    loading.value = true
    error.value = null
    const [domainResult, aliasResult, exchangeResult] = await Promise.all([
      api.listDomains(id),
      api.listAliases(id),
      api.listExternalExchanges(id),
    ])
    loading.value = false
    if (domainResult.isErr()) {
      error.value = domainResult.error.message
      return
    }
    _byAccount.value = {
      ..._byAccount.value,
      [id]: {
        domains: domainResult.value,
        // A failed aliases/exchanges call just means fewer identities to offer —
        // not worth surfacing as an error alongside a successful domains fetch.
        aliases: aliasResult.isOk() ? aliasResult.value : current.value.aliases,
        exchanges: exchangeResult.isOk() ? exchangeResult.value : current.value.exchanges,
      },
    }
  }

  /**
   * Fire-and-forget refresh: at most one in-flight (or completed) fetch per account
   * per session. Safe to call from every consumer on every mount/interaction —
   * callers render from `domains`/`aliases`/`exchanges` regardless of whether this
   * resolves from cache or a fresh request.
   */
  function ensureLoaded() {
    const id = accountStore.accountId
    if (!id || fetchedAccounts.has(id)) return
    fetchedAccounts.add(id)
    void fetchAll()
  }

  return { domains, aliases, exchanges, hasData, loading, error, ensureLoaded, fetchAll }
}, {
  persist: {
    accountKeyedRef: '_byAccount',
  },
})
