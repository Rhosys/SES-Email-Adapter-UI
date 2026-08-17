import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import { unwrap } from '@/lib/queryFns'
import type { StatsDailyBucket, StatsResponse } from '@/types/server'

const EMPTY_TOTALS: StatsResponse['totals'] = { allowed: 0, quarantined: 0, blocked: 0, aliases: 0 }

const EMPTY_STATS: StatsResponse = {
  totals: EMPTY_TOTALS,
  daily: [],
  monthly: [],
}

function padDaily(buckets: StatsDailyBucket[], createdAt: string): StatsDailyBucket[] {
  const startDate = new Date(createdAt)
  startDate.setUTCHours(0, 0, 0, 0)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const existing = new Map(buckets.map((b) => [b.date, b]))
  const padded: StatsDailyBucket[] = []

  const cursor = new Date(startDate)
  while (cursor <= today) {
    const key = cursor.toISOString().slice(0, 10)
    padded.push(existing.get(key) ?? { date: key, allowed: 0, quarantined: 0, blocked: 0, aliases: 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return padded
}

function padMonthly(buckets: StatsDailyBucket[], createdAt: string): StatsDailyBucket[] {
  const startDate = new Date(createdAt)
  const today = new Date()

  let startMonth = startDate.getUTCFullYear() * 12 + startDate.getUTCMonth()
  const endMonth = today.getUTCFullYear() * 12 + today.getUTCMonth()

  // Ensure at least 2 months so the chart renders a line, not just a dot
  if (endMonth - startMonth < 1) startMonth = endMonth - 1

  const existing = new Map(buckets.map((b) => [b.date, b]))
  const padded: StatsDailyBucket[] = []

  for (let m = startMonth; m <= endMonth; m++) {
    const year = Math.floor(m / 12)
    const month = m % 12
    const key = `${year}-${(month + 1).toString().padStart(2, '0')}`
    padded.push(existing.get(key) ?? { date: key, allowed: 0, quarantined: 0, blocked: 0, aliases: 0 })
  }
  return padded
}

export function useStatsQuery() {
  const accountStore = useAccountStore()
  const accountId = computed(() => accountStore.accountId)

  const query = useQuery({
    queryKey: computed(() => queryKeys.stats(accountId.value!)),
    queryFn: async () => unwrap(await api.getStats(accountId.value!)),
    enabled: computed(() => !!accountId.value),
  })

  // Pad daily/monthly from account creation date so charts always render a line
  const stats = computed<StatsResponse>(() => {
    const raw = query.data.value
    if (!raw) return EMPTY_STATS

    const createdAt = accountStore.account?.createdAt
    const daily = raw.daily ?? []
    const monthly = raw.monthly ?? []

    return {
      totals: raw.totals ?? EMPTY_TOTALS,
      daily: createdAt ? padDaily(daily, createdAt) : daily,
      monthly: createdAt ? padMonthly(monthly, createdAt) : monthly,
    }
  })

  return {
    stats,
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
