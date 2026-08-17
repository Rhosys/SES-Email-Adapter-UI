import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import StatsView from '@/views/StatsView.vue'
import { useAccountStore } from '@/stores/account'
import { ApiError } from '@/lib/api'
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
  monthly: [
    { date: '2025-05', allowed: 100, quarantined: 20, blocked: 15, aliases: 5 },
    { date: '2025-06', allowed: 50, quarantined: 10, blocked: 5, aliases: 0 },
  ],
}

let pinia: ReturnType<typeof createPinia>
let queryClient: QueryClient

async function mountView() {
  const wrapper = mount(StatsView, { global: { plugins: [pinia, [VueQueryPlugin, { queryClient }]] } })
  await flushPromises()
  return wrapper
}

describe('StatsView — regression gate', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listAccounts).mockResolvedValue(ok([testAccount]))
  })

  it('shows loading skeleton before stats arrive', async () => {
    vi.mocked(api.getStats).mockReturnValue(new Promise(() => {}))
    const wrapper = mount(StatsView, { global: { plugins: [pinia, [VueQueryPlugin, { queryClient }]] } })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.animate-pulse').exists()).toBe(true)
  })

  it('renders totals after successful fetch', async () => {
    vi.mocked(api.getStats).mockResolvedValue(ok(mockStats))
    const wrapper = await mountView()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('150')
    expect(wrapper.text()).toContain('30')
    expect(wrapper.text()).toContain('20')
    expect(wrapper.text()).toContain('allowed')
    expect(wrapper.text()).toContain('quarantined')
    expect(wrapper.text()).toContain('blocked')
  })

  it('shows error state on fetch failure with retry button', async () => {
    vi.mocked(api.getStats).mockRejectedValue(new ApiError(500, 'Stats unavailable'))
    const wrapper = await mountView()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Stats unavailable')
    const retryBtn = wrapper.findAll('button').find(b => b.text() === 'Retry')
    expect(retryBtn).toBeTruthy()
  })
})
