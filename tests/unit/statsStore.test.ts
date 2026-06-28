import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { useStatsStore } from '@/stores/stats'
import { useAccountStore } from '@/stores/account'
import type { Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      getStats: vi.fn(),
      listAccounts: vi.fn(),
    },
  }
})

import { api, ApiError } from '@/lib/api'

const REAL_ACCOUNT: Account = {
  accountId: 'acc-t8cmlkkck3vtm',
  name: '',
  onboarding: { completed: true, testEmailReceivedAt: '2026-06-17T17:09:21.917Z' },
  billingPlan: 'Trial',
  createdAt: '2026-06-10T17:09:21.298Z',
  updatedAt: '2026-06-23T10:21:21.773Z',
}

const REAL_STATS_RESPONSE = {
  totals: { allowed: 0, quarantined: 1, blocked: 0, aliases: 0 },
  daily: [{ date: '2026-06-24', allowed: 0, quarantined: 1, blocked: 0, aliases: 0 }],
  monthly: [{ date: '2026-06', allowed: 0, quarantined: 1, blocked: 0, aliases: 0 }],
}

describe('statsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = REAL_ACCOUNT
  })

  it('fetchStats populates stats from API response', async () => {
    vi.mocked(api.getStats).mockResolvedValue(ok(REAL_STATS_RESPONSE))
    const store = useStatsStore()
    await store.fetchStats()
    expect(store.error).toBeNull()
    expect(store.stats.totals.quarantined).toBe(1)
    expect(store.stats.totals.aliases).toBe(0)
  })

  it('fetchStats sets error on failure', async () => {
    vi.mocked(api.getStats).mockResolvedValue(err(new ApiError(500, 'Internal Server Error')))
    const store = useStatsStore()
    await store.fetchStats()
    expect(store.error).toBe('Internal Server Error')
    expect(store.stats.daily).toEqual([])
  })

  describe('daily padding', () => {
    it('pads from account createdAt through today', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-24T12:00:00Z'))

      vi.mocked(api.getStats).mockResolvedValue(ok(REAL_STATS_RESPONSE))
      const store = useStatsStore()
      await store.fetchStats()

      // Account created 2026-06-10, today is 2026-06-24 → 15 days (10..24 inclusive)
      expect(store.stats.daily).toHaveLength(15)

      // First entry is the account creation date with zeros
      expect(store.stats.daily[0]).toEqual({ date: '2026-06-10', allowed: 0, quarantined: 0, blocked: 0, aliases: 0 })

      // Last entry is today with real data
      expect(store.stats.daily[14]).toEqual({ date: '2026-06-24', allowed: 0, quarantined: 1, blocked: 0, aliases: 0 })

      // Intermediate days are zeros
      expect(store.stats.daily[5]).toEqual({ date: '2026-06-15', allowed: 0, quarantined: 0, blocked: 0, aliases: 0 })

      vi.useRealTimers()
    })

    it('preserves real data points within padded range', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-24T12:00:00Z'))

      const multiDayResponse = {
        ...REAL_STATS_RESPONSE,
        daily: [
          { date: '2026-06-20', allowed: 3, quarantined: 0, blocked: 1, aliases: 0 },
          { date: '2026-06-24', allowed: 0, quarantined: 1, blocked: 0, aliases: 0 },
        ],
      }
      vi.mocked(api.getStats).mockResolvedValue(ok(multiDayResponse))
      const store = useStatsStore()
      await store.fetchStats()

      const june20 = store.stats.daily.find((d) => d.date === '2026-06-20')
      expect(june20).toEqual({ date: '2026-06-20', allowed: 3, quarantined: 0, blocked: 1, aliases: 0 })

      const june21 = store.stats.daily.find((d) => d.date === '2026-06-21')
      expect(june21).toEqual({ date: '2026-06-21', allowed: 0, quarantined: 0, blocked: 0, aliases: 0 })

      vi.useRealTimers()
    })

    it('produces at least 2 data points even on day 1', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-10T23:00:00Z'))

      const accountStore = useAccountStore()
      accountStore.account = { ...REAL_ACCOUNT, createdAt: '2026-06-10T17:09:21.298Z' }

      vi.mocked(api.getStats).mockResolvedValue(ok({
        totals: { allowed: 0, quarantined: 0, blocked: 0, aliases: 0 },
        daily: [],
        monthly: [],
      }))
      const store = useStatsStore()
      await store.fetchStats()

      // Same day: createdAt and today are both 2026-06-10 → 1 entry
      expect(store.stats.daily.length).toBeGreaterThanOrEqual(1)
      expect(store.stats.daily[0]!.date).toBe('2026-06-10')

      vi.useRealTimers()
    })
  })

  describe('monthly padding', () => {
    it('pads from account creation month through current month', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-24T12:00:00Z'))

      vi.mocked(api.getStats).mockResolvedValue(ok(REAL_STATS_RESPONSE))
      const store = useStatsStore()
      await store.fetchStats()

      // Account created 2026-06, current month is 2026-06 → padded to 2 months minimum for chart rendering
      expect(store.stats.monthly).toHaveLength(2)
      expect(store.stats.monthly[0]).toEqual({ date: '2026-05', allowed: 0, quarantined: 0, blocked: 0, aliases: 0 })
      expect(store.stats.monthly[1]).toEqual({ date: '2026-06', allowed: 0, quarantined: 1, blocked: 0, aliases: 0 })

      vi.useRealTimers()
    })

    it('pads multiple months when account is older', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-24T12:00:00Z'))

      const accountStore = useAccountStore()
      accountStore.account = { ...REAL_ACCOUNT, createdAt: '2026-03-15T00:00:00Z' }

      vi.mocked(api.getStats).mockResolvedValue(ok(REAL_STATS_RESPONSE))
      const store = useStatsStore()
      await store.fetchStats()

      // March, April, May, June → 4 months
      expect(store.stats.monthly).toHaveLength(4)
      expect(store.stats.monthly[0]!.date).toBe('2026-03')
      expect(store.stats.monthly[3]!.date).toBe('2026-06')

      // June has real data
      expect(store.stats.monthly[3]).toEqual({ date: '2026-06', allowed: 0, quarantined: 1, blocked: 0, aliases: 0 })

      // Other months are zeros
      expect(store.stats.monthly[0]).toEqual({ date: '2026-03', allowed: 0, quarantined: 0, blocked: 0, aliases: 0 })

      vi.useRealTimers()
    })
  })

  describe('chart data suitability', () => {
    it('padded daily array always has length > 1 for line chart rendering', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-24T12:00:00Z'))

      vi.mocked(api.getStats).mockResolvedValue(ok(REAL_STATS_RESPONSE))
      const store = useStatsStore()
      await store.fetchStats()

      // With account created 2026-06-10 and today 2026-06-24, we have 15 data points
      // ECharts needs >= 2 points to draw a line
      expect(store.stats.daily.length).toBeGreaterThan(1)
    })

    it('returns empty stats when account is not loaded', () => {
      const accountStore = useAccountStore()
      accountStore.account = null
      const store = useStatsStore()
      expect(store.stats.daily).toEqual([])
      expect(store.stats.monthly).toEqual([])
      expect(store.stats.totals).toEqual({ allowed: 0, quarantined: 0, blocked: 0, aliases: 0 })
    })
  })
})
