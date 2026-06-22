import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import { useAccountStore } from '@/stores/account'
import { useDraftsStore } from '@/stores/drafts'
import type { Signal, Arc, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listArcs: vi.fn(),
      listSignals: vi.fn(),
    },
  }
})

import { api } from '@/lib/api'

function mockArc(overrides: Partial<Arc> = {}): Arc {
  return {
    arcId: 'arc_1',
    workflow: 'conversation',
    labels: [],
    status: 'active',
    summary: 'Test arc',
    lastSignalAt: '2025-01-01T12:00:00Z',
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-01T12:00:00Z',
    ...overrides,
  }
}

function mockDraft(signalId: string, arcId = 'arc_1'): Signal {
  return {
    signalId,
    arcId,
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
    vi.mocked(api.listArcs).mockResolvedValue(
      ok({ arcs: [mockArc()], pagination: { cursor: null } }),
    )
    vi.mocked(api.listSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
    await useDraftsStore().refreshTopArcs()

    const wrapper = await mountSidebar()
    const draftsLink = wrapper.get('a[href="/drafts"]')
    expect(draftsLink.text()).toContain('Drafts')
    expect(draftsLink.find('span.bg-ctp-green').exists()).toBe(false)
  })

  it('shows the draft count badge when drafts are cached', async () => {
    vi.mocked(api.listArcs).mockResolvedValue(
      ok({ arcs: [mockArc()], pagination: { cursor: null } }),
    )
    vi.mocked(api.listSignals).mockResolvedValue(
      ok({ signals: [mockDraft('d1'), mockDraft('d2')], pagination: { cursor: null } }),
    )
    await useDraftsStore().refreshTopArcs()

    const wrapper = await mountSidebar()
    const draftsLink = wrapper.get('a[href="/drafts"]')
    const badge = draftsLink.find('span.bg-ctp-green')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('2')
  })
})
