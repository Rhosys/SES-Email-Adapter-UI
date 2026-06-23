import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/api'
import { useAccountStore } from '@/stores/account'
import type { StatsResponse } from '@/types/server'

const EMPTY_TOTALS: StatsResponse["totals"] = { allowed: 0, quarantined: 0, blocked: 0 }

const EMPTY_STATS: StatsResponse = {
  totals: EMPTY_TOTALS,
  daily: [],
  monthly: [],
}

export const useStatsStore = defineStore('stats', () => {
  const accountStore = useAccountStore()

  const _byAccount = ref<Record<string, StatsResponse>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Always populated — EMPTY_STATS until the first fetch resolves, then the cached response.
  // Guards against stale localStorage entries missing expected nested properties.
  const stats = computed<StatsResponse>(() => {
    const id = accountStore.accountId
    const raw = id ? _byAccount.value[id] : undefined
    if (!raw) return EMPTY_STATS
    return {
      totals: raw.totals ?? EMPTY_TOTALS,
      daily: raw.daily ?? [],
      monthly: raw.monthly ?? [],
    }
  })

  const loaded = computed(() => {
    const id = accountStore.accountId
    return id !== null && id in _byAccount.value
  })

  // Skips the loading spinner on refetch — the cached value stays visible while it updates.
  async function fetchStats() {
    const id = accountStore.accountId
    if (!id) return
    loading.value = !(id in _byAccount.value)
    error.value = null
    const result = await api.getStats(id)
    loading.value = false
    if (result.isErr()) {
      error.value = result.error.message
      return
    }
    _byAccount.value = { ..._byAccount.value, [id]: result.value }
  }

  return { stats, loaded, loading, error, fetchStats }
}, {
  persist: {
    accountKeyedRef: '_byAccount',
  },
})
