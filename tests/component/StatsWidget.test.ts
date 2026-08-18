import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import StatsWidget from '@/components/StatsWidget.vue'
import { useAccountStore } from '@/stores/account'
import { useUiStore } from '@/stores/ui'
import type { Account, StatsResponse } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listAccounts: vi.fn(),
      getStats: vi.fn(),
    },
  }
})

import { api } from '@/lib/api'

const testAccount: Account = {
  accountId: 'acc_1',
  name: 'Test',
  filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
}

const mockStats: StatsResponse = {
  totals: { allowed: 150, quarantined: 30, blocked: 20, aliases: 5 },
  daily: [
    { date: '2025-06-01', allowed: 10, quarantined: 2, blocked: 1, aliases: 0 },
    { date: '2025-06-02', allowed: 12, quarantined: 3, blocked: 2, aliases: 0 },
  ],
  monthly: [],
}

let pinia: ReturnType<typeof createPinia>
let queryClient: QueryClient

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/stats', name: 'stats', component: { template: '<div />' } },
    ],
  })
}

async function mountWidget() {
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  const wrapper = mount(StatsWidget, {
    global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient }]] },
  })
  await flushPromises()
  return wrapper
}

describe('StatsWidget — regression gate', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listAccounts).mockResolvedValue(ok([testAccount]))
    useUiStore().statsWidgetExpanded = true
  })

  it('shows spinner while stats query is pending', async () => {
    vi.mocked(api.getStats).mockReturnValue(new Promise(() => {}))
    const router = makeRouter()
    await router.push('/')
    await router.isReady()
    const wrapper = mount(StatsWidget, {
      global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient }]] },
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    // domReady becomes true after onMounted nextTick, but stats.daily is still
    // empty ([] from EMPTY_STATS default) so the spinner shows
    expect(wrapper.find('.animate-spin').exists()).toBe(true)
  })

  it('renders totals once data arrives', async () => {
    vi.mocked(api.getStats).mockResolvedValue(ok(mockStats))
    const wrapper = await mountWidget()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('150')
    expect(wrapper.text()).toContain('30')
    expect(wrapper.text()).toContain('20')
    expect(wrapper.text()).toContain('5')
    expect(wrapper.text()).toContain('allowed')
    expect(wrapper.text()).toContain('quarantined')
    expect(wrapper.text()).toContain('blocked')
    expect(wrapper.text()).toContain('aliases')
  })

  it('hides data panel when widget is collapsed', async () => {
    useUiStore().statsWidgetExpanded = false
    vi.mocked(api.getStats).mockResolvedValue(ok(mockStats))
    const wrapper = await mountWidget()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('150')
    expect(wrapper.text()).toContain('Stats')
  })

  it('toggles expand/collapse on header button click', async () => {
    vi.mocked(api.getStats).mockResolvedValue(ok(mockStats))
    const wrapper = await mountWidget()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('150')

    await wrapper.find('button[aria-label="Toggle stats widget"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('150')
  })
})
