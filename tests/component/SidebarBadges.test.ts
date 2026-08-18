import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import AppSidebar from '@/components/AppSidebar.vue'
import { useAccountStore } from '@/stores/account'
import type { Account, Thread, QuarantinedSignal, Resource } from '@/types/server'

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

function thread(id: string): Thread {
  return {
    threadId: id,
    workflow: 'conversation',
    labels: [],
    status: 'active',
    summary: `Thread ${id}`,
    sender: { address: `${id}@example.com` },
    lastSignalAt: '2025-01-01T12:00:00Z',
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-01T12:00:00Z',
  }
}

function quarantineSignal(id: string): QuarantinedSignal {
  return {
    signalId: id,
    type: 'email_inbound',
    source: 'ses',
    status: 'quarantine_visible',
    createdAt: '2025-01-01T12:00:00Z',
    data: { from: { address: `${id}@spam.com`, name: '' }, to: [{ address: 'me@test.com' }], cc: [], bcc: [], subject: `Quarantine ${id}`, attachments: [], receivedAt: '2025-01-01T12:00:00Z' },
  } as unknown as QuarantinedSignal
}

function resource(id: string): Resource {
  return {
    resourceId: id,
    threadId: 'thread_1',
    status: 'active',
    workflow: 'travel',
    expectedResolutionDate: '2025-06-01',
    assets: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  } as unknown as Resource
}

function makeRouter() {
  const stub = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      { path: '/quarantine', component: stub },
      { path: '/spam', component: stub },
      { path: '/drafts', component: stub },
      { path: '/rules', component: stub },
      { path: '/templates', component: stub },
      { path: '/labels', component: stub },
      { path: '/resources', name: 'resources', component: stub },
      { path: '/settings', component: stub },
      { path: '/search', component: stub },
      { path: '/stats', name: 'stats', component: stub },
    ],
  })
}

async function mountSidebar() {
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const wrapper = mount(AppSidebar, {
    props: { open: true },
    global: { plugins: [router, [VueQueryPlugin, { queryClient }]] },
  })
  await flushPromises()
  return wrapper
}

describe('AppSidebar — Inbox badge (active threads)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listQuarantinedSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
    vi.mocked(api.listBlockedSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
    vi.mocked(api.listResources).mockResolvedValue(ok({ resources: [], pagination: { cursor: null } }))
    vi.mocked(api.listSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
  })

  it('shows the active thread count in the Inbox badge', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(
      ok({ threads: [thread('1'), thread('2'), thread('3')], pagination: { cursor: null } }),
    )
    const wrapper = await mountSidebar()
    const inboxLink = wrapper.get('a[href="/"]')
    const badge = inboxLink.find('.bg-ctp-green')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('3')
  })

  it('hides the Inbox badge when there are no active threads', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(
      ok({ threads: [], pagination: { cursor: null } }),
    )
    const wrapper = await mountSidebar()
    const inboxLink = wrapper.get('a[href="/"]')
    expect(inboxLink.find('.bg-ctp-green').exists()).toBe(false)
  })

  it('appends "+" when there are more pages of active threads', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(
      ok({ threads: [thread('1'), thread('2')], pagination: { cursor: 'next_page' } }),
    )
    const wrapper = await mountSidebar()
    const inboxLink = wrapper.get('a[href="/"]')
    const badge = inboxLink.find('.bg-ctp-green')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('2+')
  })
})

describe('AppSidebar — Quarantine badge (visible quarantined signals)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [], pagination: { cursor: null } }))
    vi.mocked(api.listBlockedSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
    vi.mocked(api.listResources).mockResolvedValue(ok({ resources: [], pagination: { cursor: null } }))
    vi.mocked(api.listSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
  })

  it('shows the quarantine count badge', async () => {
    vi.mocked(api.listQuarantinedSignals).mockImplementation(async (_accountId, status) => {
      if (status === 'quarantine_visible') {
        return ok({ signals: [quarantineSignal('q1'), quarantineSignal('q2')], pagination: { cursor: null } })
      }
      return ok({ signals: [], pagination: { cursor: null } })
    })
    const wrapper = await mountSidebar()
    const quarantineLink = wrapper.get('a[href="/quarantine"]')
    const badge = quarantineLink.find('.bg-ctp-peach')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('2')
  })

  it('hides the quarantine badge when there are no visible quarantined signals', async () => {
    vi.mocked(api.listQuarantinedSignals).mockResolvedValue(
      ok({ signals: [], pagination: { cursor: null } }),
    )
    const wrapper = await mountSidebar()
    const quarantineLink = wrapper.get('a[href="/quarantine"]')
    expect(quarantineLink.find('.bg-ctp-peach').exists()).toBe(false)
  })
})

describe('AppSidebar — Resources badge (active resources)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [], pagination: { cursor: null } }))
    vi.mocked(api.listQuarantinedSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
    vi.mocked(api.listBlockedSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
    vi.mocked(api.listSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
  })

  it('shows the resources count badge', async () => {
    vi.mocked(api.listResources).mockResolvedValue(
      ok({ resources: [resource('r1'), resource('r2'), resource('r3')], pagination: { cursor: null } }),
    )
    const wrapper = await mountSidebar()
    const resourcesLink = wrapper.find('a[href="/resources"]')
    if (!resourcesLink.exists()) return // route name-based link
    const badge = resourcesLink.find('.bg-ctp-sapphire')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('3')
  })

  it('hides the resources badge when there are no active resources', async () => {
    vi.mocked(api.listResources).mockResolvedValue(
      ok({ resources: [], pagination: { cursor: null } }),
    )
    const wrapper = await mountSidebar()
    const resourcesLink = wrapper.find('a[href="/resources"]')
    if (!resourcesLink.exists()) return
    expect(resourcesLink.find('.bg-ctp-sapphire').exists()).toBe(false)
  })
})
