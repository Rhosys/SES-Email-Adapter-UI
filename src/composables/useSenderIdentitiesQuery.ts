import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
import type { Alias, Domain, ExternalMailExchange } from '@/types/server'

interface SenderIdentities {
  domains: Domain[]
  aliases: Alias[]
  exchanges: ExternalMailExchange[]
}

async function fetchSenderIdentities(accountId: string): Promise<SenderIdentities> {
  const [domainResult, aliasResult, exchangeResult] = await Promise.all([
    api.listDomains(accountId),
    api.listAliases(accountId),
    api.listExternalExchanges(accountId),
  ])

  const domains = unwrap(domainResult)
  // Aliases/exchanges failing is non-fatal — fewer identities to offer, not an error.
  const aliases = aliasResult.isOk() ? aliasResult.value : []
  const exchanges = exchangeResult.isOk() ? exchangeResult.value : []

  return { domains, aliases, exchanges }
}

/**
 * Read-only query for sender identities (domains, aliases, external exchanges).
 * Used by the draft composer's From picker and settings.
 */
export function useSenderIdentitiesQuery() {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const query = useQuery({
    queryKey: computed(() => queryKeys.senderIdentities(accountId.value!)),
    queryFn: async () => fetchSenderIdentities(accountId.value!),
    enabled: computed(() => !!accountId.value),
  })

  const domains = computed<Domain[]>(() => query.data.value?.domains ?? [])
  const aliases = computed<Alias[]>(() => query.data.value?.aliases ?? [])
  const exchanges = computed<ExternalMailExchange[]>(() => query.data.value?.exchanges ?? [])
  const hasData = computed(() => query.data.value !== undefined)

  return { query, domains, aliases, exchanges, hasData }
}
