import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
import type { StatsResponse } from '@/types/server'

const emptyStats: StatsResponse = { totals: { allowed: 0, quarantined: 0, blocked: 0, aliases: 0 }, daily: [], monthly: [] }

export function useStatsQuery() {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const query = useQuery({
    queryKey: computed(() => queryKeys.stats(accountId.value!)),
    queryFn: async () => unwrap(await api.getStats(accountId.value!)),
    enabled: computed(() => !!accountId.value),
  })

  const stats = computed<StatsResponse>(() => query.data.value ?? emptyStats)

  return { stats, error: query.error, refetch: query.refetch, query }
}
