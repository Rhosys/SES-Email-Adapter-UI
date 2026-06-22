import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import DraftsView from '@/views/DraftsView.vue'
import { useAccountStore } from '@/stores/account'
import type { Signal, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listDraftSignals: vi.fn(),
      deleteDraftSignal: vi.fn(),
    },
  }
})

import { api } from '@/lib/api'

function mockDraft(signalId: string, subject: string): Signal {
  return {
    signalId,
    arcId: `arc_${signalId}`,
    type: 'email',
    source: 'user',
    status: 'draft',
    createdAt: '2025-01-01T12:00:00Z',
    data: {
      from: { address: 'me@example.com' },
      to: [{ address: 'them@example.com' }],
      cc: [],
      bcc: [],
      subject,
      body: 'Draft body',
      attachments: [],
      sendInitiatedAt: '',
    },
  } as Signal
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/drafts', component: DraftsView },
      { path: '/arcs/:id', name: 'arc-detail', component: { template: '<div />' } },
    ],
  })
}

async function mountView() {
  const router = makeRouter()
  await router.push('/drafts')
  await router.isReady()
  const wrapper = mount(DraftsView, {
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

describe('DraftsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const accountStore = useAccountStore()
    accountStore.account = { accountId: 'acc_1', name: 'Test' } as Account
  })

  it('renders the empty state when there are no drafts', async () => {
    vi.mocked(api.listDraftSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('No drafts')
  })

  it('renders a row per draft signal', async () => {
    vi.mocked(api.listDraftSignals).mockResolvedValue(
      ok({
        signals: [mockDraft('d1', 'First draft'), mockDraft('d2', 'Second draft')],
        pagination: { cursor: null },
      }),
    )
    const wrapper = await mountView()

    const rows = wrapper.findAll('[role="listitem"]')
    expect(rows).toHaveLength(2)
    expect(wrapper.text()).toContain('First draft')
    expect(wrapper.text()).toContain('Second draft')
  })

  it('removes a row from the list after discarding', async () => {
    vi.mocked(api.listDraftSignals).mockResolvedValue(
      ok({ signals: [mockDraft('d1', 'First draft')], pagination: { cursor: null } }),
    )
    vi.mocked(api.deleteDraftSignal).mockResolvedValue(ok(undefined))
    const wrapper = await mountView()

    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(1)

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(0)
    expect(wrapper.text()).toContain('No drafts')
  })
})
