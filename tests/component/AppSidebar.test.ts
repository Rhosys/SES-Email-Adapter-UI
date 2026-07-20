import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import { useAccountStore } from '@/stores/account'
import { useDraftsStore } from '@/stores/drafts'
import type { Signal, Thread, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listThreads: vi.fn(),
      listSignals: vi.fn(),
    },
  }
})

import { api } from '@/lib/api'

function mockThread(overrides: Partial<Thread> = {}): Thread {
  return {
    threadId: 'thread_1',
    workflow: 'conversation',
    labels: [],
    status: 'active',
    summary: 'Test thread',
    lastSignalAt: '2025-01-01T12:00:00Z',
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-01T12:00:00Z',
    ...overrides,
  }
}

function mockDraft(signalId: string, threadId = 'thread_1'): Signal {
  return {
    signalId,
    threadId,
    type: 'email',
    source: 'user',
    status: 'draft',
    createdAt: '2025-01-01T12:00:00Z',
    data: {
      from: { address: 'me@example.com' },
      to: [{ address: 'them@example.com' }],
      cc: [],
      bcc: [],
      subject: 'Test draft',
      body: 'Draft body',
      attachments: [],
      sendInitiatedAt: '',
    },
  } as Signal
}

function makeRouter() {
  const stub = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      { path: '/quarantine', component: stub },
      { path: '/drafts', component: stub },
      { path: '/rules', component: stub },
      { path: '/templates', component: stub },
      { path: '/labels', component: stub },
      { path: '/settings', component: stub },
      { path: '/search', component: stub },
    ],
  })
}

async function mountSidebar() {
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  return mount(AppSidebar, {
    props: { open: true },
    global: { plugins: [router] },
  })
}

describe('AppSidebar — draft count badge', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  it('hides the draft badge when there are no drafts', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(
      ok({ threads: [mockThread()], pagination: { cursor: null } }),
    )
    vi.mocked(api.listSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
    await useDraftsStore().refreshTopThreads()

    const wrapper = await mountSidebar()
    const draftsLink = wrapper.get('a[href="/drafts"]')
    expect(draftsLink.text()).toContain('Drafts')
    expect(draftsLink.find('span.bg-ctp-mauve').exists()).toBe(false)
  })

  it('shows the draft count badge when drafts are cached', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(
      ok({ threads: [mockThread()], pagination: { cursor: null } }),
    )
    vi.mocked(api.listSignals).mockResolvedValue(
      ok({ signals: [mockDraft('d1'), mockDraft('d2')], pagination: { cursor: null } }),
    )
    await useDraftsStore().refreshTopThreads()

    const wrapper = await mountSidebar()
    const draftsLink = wrapper.get('a[href="/drafts"]')
    const badge = draftsLink.find('span.bg-ctp-mauve')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('2')
  })
})

describe('AppSidebar — Settings/Admin pinned outside the scrollable nav', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
    vi.mocked(api.listThreads).mockResolvedValue(ok({ threads: [], pagination: { cursor: null } }))
    vi.mocked(api.listSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
  })

  // Regression guard for the "growth separator": Settings/Admin must live in a
  // nav distinct from the scrollable primary nav (aria-label="Primary"), so a
  // long Views/Labels list can never scroll them out of view. If a future
  // change moves them back inside the primary nav, this fails.
  it('renders Settings and Admin in a nav separate from the scrollable primary nav', async () => {
    const wrapper = await mountSidebar()
    const navs = wrapper.findAll('nav')
    const primaryNav = navs.find((n) => n.attributes('aria-label') === 'Primary')
    const accountNav = navs.find((n) => n.attributes('aria-label') === 'Account')
    expect(primaryNav).toBeTruthy()
    expect(accountNav).toBeTruthy()

    const settingsLink = wrapper.get('a[href="/settings"]')
    expect(accountNav!.element.contains(settingsLink.element)).toBe(true)
    expect(primaryNav!.element.contains(settingsLink.element)).toBe(false)
  })
})
