import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import InboxView from '@/views/InboxView.vue'
import { useAccountStore } from '@/stores/account'
import type { Account, Thread } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listThreads: vi.fn(),
      listSignals: vi.fn(),
      listBlockedSignals: vi.fn(),
      listQuarantinedSignals: vi.fn(),
      listResources: vi.fn(),
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

function thread(id: string, status: 'active' | 'archived'): Thread {
  return {
    threadId: id,
    workflow: 'conversation',
    labels: [],
    status,
    summary: `${status} thread ${id}`,
    sender: { address: `${id}@example.com` },
    lastSignalAt: '2025-01-01T12:00:00Z',
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-01T12:00:00Z',
  }
}

const ACTIVE_THREADS = [thread('a1', 'active'), thread('a2', 'active'), thread('a3', 'active')]
const ARCHIVED_THREADS = [thread('x1', 'archived'), thread('x2', 'archived')]

function makeRouter() {
  const stub = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'inbox', component: stub },
      { path: '/threads/:id', name: 'thread-detail', component: stub },
      { path: '/quarantine', name: 'quarantine', component: stub },
      { path: '/rules', name: 'rules', component: stub },
      { path: '/labels', name: 'labels', component: stub },
      { path: '/resources', name: 'resources', component: stub },
      { path: '/settings', component: stub },
      { path: '/stats', name: 'stats', component: stub },
      { path: '/search', name: 'search', component: stub },
    ],
  })
}

async function mountInboxView() {
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const wrapper = mount(InboxView, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient }]] },
  })
  await flushPromises()
  return wrapper
}

describe('InboxView — badge count stability across tab switches', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
    vi.mocked(api.listBlockedSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
    vi.mocked(api.listQuarantinedSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
    vi.mocked(api.listResources).mockResolvedValue(ok({ resources: [], pagination: { cursor: null } }))
    vi.mocked(api.getStats).mockResolvedValue(ok({
      totals: { allowed: 3, quarantined: 0, blocked: 0, aliases: 1 },
      daily: [],
      monthly: [],
    }))
  })

  it('mobile badge shows active count even after switching to the Archived tab', async () => {
    vi.mocked(api.listThreads).mockImplementation(async (_accountId, params) => {
      if (params.status === 'active') {
        return ok({ threads: ACTIVE_THREADS, pagination: { cursor: null } })
      }
      if (params.status === 'archived') {
        return ok({ threads: ARCHIVED_THREADS, pagination: { cursor: null } })
      }
      return ok({ threads: [...ACTIVE_THREADS, ...ARCHIVED_THREADS], pagination: { cursor: null } })
    })

    const wrapper = await mountInboxView()

    // The mobile tab bar has role="tablist" with aria-label="Thread status"
    const mobileBar = wrapper.find('[role="tablist"][aria-label="Thread status"]')
    expect(mobileBar.exists()).toBe(true)

    // Badge should show 3 (active count)
    const badgeSpan = mobileBar.find('.bg-ctp-green')
    expect(badgeSpan.exists()).toBe(true)
    expect(badgeSpan.text()).toBe('3')

    // Switch to Archived tab
    const archivedTab = mobileBar.findAll('button').find(
      (b) => b.attributes('aria-label')?.includes('archived') || b.text().includes('Archived'),
    )
    expect(archivedTab).toBeTruthy()
    await archivedTab!.trigger('click')
    await flushPromises()

    // Badge must STILL show 3 (active count) — not 2 (archived count)
    const badgeAfterSwitch = mobileBar.find('.bg-ctp-green')
    expect(badgeAfterSwitch.exists()).toBe(true)
    expect(badgeAfterSwitch.text()).toBe('3')
  })

  it('mobile badge shows active count when app opens on the Archived tab', async () => {
    vi.mocked(api.listThreads).mockImplementation(async (_accountId, params) => {
      if (params.status === 'active') {
        return ok({ threads: ACTIVE_THREADS, pagination: { cursor: null } })
      }
      if (params.status === 'archived') {
        return ok({ threads: ARCHIVED_THREADS, pagination: { cursor: null } })
      }
      return ok({ threads: [...ACTIVE_THREADS, ...ARCHIVED_THREADS], pagination: { cursor: null } })
    })

    const router = makeRouter()
    await router.push('/?tab=archived')
    await router.isReady()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    const wrapper = mount(InboxView, {
      global: { plugins: [router, [VueQueryPlugin, { queryClient }]] },
    })
    await flushPromises()

    const mobileBar = wrapper.find('[role="tablist"][aria-label="Thread status"]')
    const badgeSpan = mobileBar.find('.bg-ctp-green')
    expect(badgeSpan.exists()).toBe(true)
    expect(badgeSpan.text()).toBe('3')
  })
})
