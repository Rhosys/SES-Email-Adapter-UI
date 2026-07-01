import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import DraftsView from '@/views/DraftsView.vue'
import { useAccountStore } from '@/stores/account'
import type { Signal, Thread, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listThreads: vi.fn(),
      listSignals: vi.fn(),
      deleteDraftSignal: vi.fn(),
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

function mockDraft(signalId: string, subject: string, threadId = 'thread_1'): Signal {
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
      { path: '/threads/:id', name: 'thread-detail', component: { template: '<div />' } },
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
    vi.mocked(api.listThreads).mockResolvedValue(
      ok({ threads: [mockThread()], pagination: { cursor: null } }),
    )
    vi.mocked(api.listSignals).mockResolvedValue(ok({ signals: [], pagination: { cursor: null } }))
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('No drafts')
  })

  it('renders a row per draft signal', async () => {
    vi.mocked(api.listThreads).mockResolvedValue(
      ok({
        threads: [mockThread({ threadId: 'thread_d1' }), mockThread({ threadId: 'thread_d2' })],
        pagination: { cursor: null },
      }),
    )
    vi.mocked(api.listSignals).mockImplementation(async (_account, threadId) =>
      ok({
        signals:
          threadId === 'thread_d1'
            ? [mockDraft('d1', 'First draft', 'thread_d1')]
            : [mockDraft('d2', 'Second draft', 'thread_d2')],
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
    vi.mocked(api.listThreads).mockResolvedValue(
      ok({ threads: [mockThread()], pagination: { cursor: null } }),
    )
    vi.mocked(api.listSignals).mockResolvedValue(
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
