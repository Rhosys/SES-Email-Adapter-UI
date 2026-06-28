import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import type { StatsDailyBucket, StatsResponse } from '@/types/server'

const EMPTY_TOTALS: StatsResponse["totals"] = { allowed: 0, quarantined: 0, blocked: 0, aliases: 0 }

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

export const useStatsStore = defineStore('stats', () => {
  const accountStore = useAccountStore()

  const _byAccount = ref<Record<string, StatsResponse>>({})
  const error = ref<string | null>(null)

  // Always populated — EMPTY_STATS until the first fetch resolves, then the cached response.
  // Pads daily/monthly from account creation date so charts always render a line.
  const stats = computed<StatsResponse>(() => {
    const id = accountStore.accountId
    const raw = id ? _byAccount.value[id] : undefined
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

  async function fetchStats() {
    const id = accountStore.accountId
    if (!id) return
    error.value = null
    const result = await api.getStats(id)
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    _byAccount.value = { ..._byAccount.value, [id]: result.value }
  }

  return { stats, error, fetchStats }
}, {
  persist: {
    accountKeyedRef: '_byAccount',
  },
})
