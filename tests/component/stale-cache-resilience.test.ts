import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { persistentStorePlugin } from '@/plugins/persistent-store'
import { useAccountStore } from '@/stores/account'
import { useStatsStore } from '@/stores/stats'
import { useArcsStore } from '@/stores/arcs'
import { useQuarantineStore } from '@/stores/quarantine'
import StatsWidget from '@/components/StatsWidget.vue'
import type { Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      getStats: vi.fn().mockResolvedValue({ isErr: () => true, error: { message: 'offline' } }),
      listArcs: vi.fn().mockResolvedValue({ isErr: () => true, error: { message: 'offline' } }),
      listQuarantinedSignals: vi.fn().mockResolvedValue({ isErr: () => true, error: { message: 'offline' } }),
    },
  }
})

const ACCOUNT_ID = 'acc_stale_test'
const VERSION = 1

function seedLocalStorage(storeId: string, data: unknown) {
  const key = `ses:v${VERSION}:${ACCOUNT_ID}:${storeId}`
  localStorage.setItem(key, JSON.stringify({ data, writtenAt: Date.now() }))
}

function makeRouter() {
  const stub = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      { path: '/stats', name: 'stats', component: stub },
    ],
  })
}

describe('stale cache resilience — stores survive outdated localStorage shapes', () => {
  beforeEach(() => {
    localStorage.clear()
    const pinia = createPinia()
    pinia.use(persistentStorePlugin)
    setActivePinia(pinia)
  })

  it('stats store handles cache missing totals (old schema without totals)', () => {
    // Simulate an old cache entry that has no "totals" key
    seedLocalStorage('stats', { someOldField: 42 })

    const accountStore = useAccountStore()
    accountStore.account = { accountId: ACCOUNT_ID, name: 'Test' } as Account

    const statsStore = useStatsStore()

    // Must not throw — totals should fall back to zeros
    expect(statsStore.stats.totals.allowed).toBe(0)
    expect(statsStore.stats.totals.quarantined).toBe(0)
    expect(statsStore.stats.totals.blocked).toBe(0)
    expect(statsStore.stats.daily).toEqual([])
    expect(statsStore.stats.monthly).toEqual([])
  })

  it('stats store handles cache with null totals', () => {
    seedLocalStorage('stats', { totals: null, daily: null, monthly: null })

    const accountStore = useAccountStore()
    accountStore.account = { accountId: ACCOUNT_ID, name: 'Test' } as Account

    const statsStore = useStatsStore()

    expect(statsStore.stats.totals.allowed).toBe(0)
    expect(statsStore.stats.daily).toEqual([])
    expect(statsStore.stats.monthly).toEqual([])
  })

  it('stats store handles completely empty object from cache', () => {
    seedLocalStorage('stats', {})

    const accountStore = useAccountStore()
    accountStore.account = { accountId: ACCOUNT_ID, name: 'Test' } as Account

    const statsStore = useStatsStore()

    expect(statsStore.stats.totals.allowed).toBe(0)
    expect(statsStore.stats.totals.quarantined).toBe(0)
    expect(statsStore.stats.totals.blocked).toBe(0)
  })

  it('arcs store handles non-array cache (old shape was maybe an object)', () => {
    // If someone stored arcs as an object instead of array
    seedLocalStorage('arcs', { arcId: 'old', status: 'active' })

    const accountStore = useAccountStore()
    accountStore.account = { accountId: ACCOUNT_ID, name: 'Test' } as Account

    const arcsStore = useArcsStore()

    // activeCount iterates _byAccount[id] with filter — must not crash
    expect(arcsStore.activeCount).toBe(0)
    expect(arcsStore.items).toEqual([])
  })

  it('quarantine store handles cache missing visible/hidden keys', () => {
    // Old shape might have been a flat array
    seedLocalStorage('quarantine', [{ signalId: 'old' }])

    const accountStore = useAccountStore()
    accountStore.account = { accountId: ACCOUNT_ID, name: 'Test' } as Account

    const quarantineStore = useQuarantineStore()

    expect(quarantineStore.visibleCount).toBe(0)
    expect(quarantineStore.quarantineVisible).toEqual([])
    expect(quarantineStore.quarantineHidden).toEqual([])
  })

  it('quarantine store handles cache with null visible', () => {
    seedLocalStorage('quarantine', { visible: null, hidden: null })

    const accountStore = useAccountStore()
    accountStore.account = { accountId: ACCOUNT_ID, name: 'Test' } as Account

    const quarantineStore = useQuarantineStore()

    expect(quarantineStore.visibleCount).toBe(0)
    expect(quarantineStore.quarantineVisible).toEqual([])
  })

  it('StatsWidget renders without crash when cache has stale data', async () => {
    seedLocalStorage('stats', { unknownOldField: true })

    const accountStore = useAccountStore()
    accountStore.account = { accountId: ACCOUNT_ID, name: 'Test' } as Account

    const router = makeRouter()
    await router.push('/')
    await router.isReady()

    // Must not throw during mount
    const wrapper = mount(StatsWidget, {
      global: { plugins: [router] },
    })

    expect(wrapper.exists()).toBe(true)
  })
})
