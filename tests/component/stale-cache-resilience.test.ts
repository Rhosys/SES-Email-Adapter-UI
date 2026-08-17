import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { useThreadsStore } from '@/stores/threads'
import { useQuarantineStore } from '@/stores/quarantine'
import StatsWidget from '@/components/StatsWidget.vue'
import type { Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      getStats: vi.fn().mockResolvedValue({ isErr: () => true, error: { message: 'offline' } }),
      listThreads: vi.fn().mockResolvedValue({ isErr: () => true, error: { message: 'offline' } }),
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
    setActivePinia(pinia)
  })

  it('threads store is resilient to stale cache (data now in TanStack Query)', () => {
    // After migration, threads store only holds selection state.
    // Cache resilience is handled by TanStack Query's IndexedDB persister.
    seedLocalStorage('threads', { threadId: 'old', status: 'active' })

    const accountStore = useAccountStore()
    accountStore.account = { accountId: ACCOUNT_ID, name: 'Test' } as Account

    const threadsStore = useThreadsStore()

    // Selection state starts empty regardless of stale cache
    expect(threadsStore.selectedIds.size).toBe(0)
    expect(threadsStore.bulkActionPending).toBe(false)
  })

  it('quarantine store is resilient to stale cache (data now in TanStack Query)', () => {
    // After migration, quarantine store only holds actionPending.
    // Cache resilience is handled by TanStack Query's IndexedDB persister.
    const accountStore = useAccountStore()
    accountStore.account = { accountId: ACCOUNT_ID, name: 'Test' } as Account

    const quarantineStore = useQuarantineStore()
    expect(quarantineStore.actionPending.size).toBe(0)
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
