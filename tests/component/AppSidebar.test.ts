import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import { useAccountStore } from '@/stores/account'
import { useDraftsStore } from '@/stores/drafts'
import type { Signal, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listDraftSignals: vi.fn(),
    },
  }
})

import { api } from '@/lib/api'

function mockDraft(signalId: string): Signal {
  return {
    signalId,
    arcId: 'arc_1',
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
    vi.mocked(api.listDraftSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
    await useDraftsStore().fetchDrafts(true)

    const wrapper = await mountSidebar()
    const draftsLink = wrapper.get('a[href="/drafts"]')
    expect(draftsLink.text()).toContain('Drafts')
    expect(draftsLink.find('span.bg-ctp-green').exists()).toBe(false)
  })

  it('shows the draft count badge when drafts are cached', async () => {
    vi.mocked(api.listDraftSignals).mockResolvedValue(
      ok({ signals: [mockDraft('d1'), mockDraft('d2')], pagination: { cursor: null } }),
    )
    await useDraftsStore().fetchDrafts(true)

    const wrapper = await mountSidebar()
    const draftsLink = wrapper.get('a[href="/drafts"]')
    const badge = draftsLink.find('span.bg-ctp-green')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('2')
  })
})
