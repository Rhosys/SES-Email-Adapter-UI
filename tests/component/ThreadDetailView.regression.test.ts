import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import ThreadDetailView from '@/views/ThreadDetailView.vue'
import { useAccountStore } from '@/stores/account'
import type { Thread, Signal, Account } from '@/types/server'

Element.prototype.scrollIntoView = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listAccounts: vi.fn(),
      getThread: vi.fn(),
      listSignals: vi.fn(),
      patchThread: vi.fn(),
      createDraftSignal: vi.fn(),
      sendSignal: vi.fn(),
      rsvpSignal: vi.fn(),
      deleteDraftSignal: vi.fn(),
      updateDraftSignal: vi.fn(),
      listDomains: vi.fn(),
      listAliases: vi.fn(),
      listExternalExchanges: vi.fn(),
      listResourcesByThread: vi.fn(),
      patchResource: vi.fn(),
      unsubscribeThread: vi.fn(),
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

function mockThread(overrides: Partial<Thread> = {}): Thread {
  return {
    threadId: 'thread_1',
    workflow: 'conversation',
    labels: [],
    status: 'active',
    summary: 'Test thread',
    sender: { address: 'sender@example.com' },
    lastSignalAt: '2025-06-01T00:00:00Z',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
    ...overrides,
  }
}

function mockEmailSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    signalId: 'sig_1',
    threadId: 'thread_1',
    type: 'email',
    source: 'system',
    status: 'active',
    createdAt: '2025-01-01T12:00:00Z',
    data: {
      receivedAt: '2025-01-01T12:00:00Z',
      summary: 'Test',
      from: { address: 'sender@example.com', name: 'Sender' },
      to: [{ address: 'inbox@example.com' }],
      cc: [],
      subject: 'Test subject',
      body: 'Hello world',
      attachments: [],
      headers: {},
      recipientAddress: 'inbox@example.com',
      workflow: 'conversation',
      spamScore: 0,
    },
    ...overrides,
  } as Signal
}

function mockDraftSignal(): Signal {
  return {
    signalId: 'sig_draft',
    threadId: 'thread_1',
    type: 'email',
    source: 'user',
    status: 'draft',
    createdAt: '2025-01-01T12:05:00Z',
    data: {
      from: { address: 'inbox@example.com' },
      to: [{ address: 'sender@example.com' }],
      cc: [],
      bcc: [],
      subject: 'Re: Test subject',
      body: '',
      attachments: [],
      sendInitiatedAt: '',
    },
  } as Signal
}

function mockCalendarEventSignal(): Signal {
  return {
    signalId: 'sig_cal_1',
    threadId: 'thread_1',
    type: 'calendar_event',
    source: 'system',
    status: 'active',
    createdAt: '2025-06-10T10:00:00Z',
    data: {
      title: 'Team Standup',
      startTime: '2025-06-12T09:00:00Z',
      endTime: '2025-06-12T09:30:00Z',
      location: 'Zoom',
      organizer: 'boss@example.com',
      organizerName: 'Boss',
      attendees: [{ address: 'me@example.com', name: 'Me' }],
      linkedSignalId: 'sig_linked',
    },
  } as Signal
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/threads/:id', component: ThreadDetailView },
      { path: '/', component: { template: '<div />' } },
    ],
  })
}

let pinia: ReturnType<typeof createPinia>

async function mountView(thread: Thread, signals: Signal[] = [], pagination: { cursor: string | null } = { cursor: null }) {
  vi.mocked(api.getThread).mockResolvedValue(ok(thread))
  vi.mocked(api.listSignals).mockResolvedValue(ok({ signals, pagination }))
  vi.mocked(api.listResourcesByThread).mockResolvedValue(ok({ resources: [], pagination: { cursor: null } }))

  const router = makeRouter()
  await router.push(`/threads/${thread.threadId}`)
  await router.isReady()

  const wrapper = mount(ThreadDetailView, {
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('ThreadDetailView — regression gate', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listAccounts).mockResolvedValue(ok([testAccount]))
    vi.mocked(api.listDomains).mockResolvedValue(ok([]))
    vi.mocked(api.listAliases).mockResolvedValue(ok([]))
    vi.mocked(api.listExternalExchanges).mockResolvedValue(ok([]))
  })

  // ── Signal list loading ──────────────────────────────────────────────────
  it('shows loading skeleton while signals are being fetched', async () => {
    vi.mocked(api.getThread).mockResolvedValue(ok(mockThread()))
    vi.mocked(api.listSignals).mockReturnValue(new Promise(() => {}))
    vi.mocked(api.listResourcesByThread).mockResolvedValue(ok({ resources: [], pagination: { cursor: null } }))

    const router = makeRouter()
    await router.push('/threads/thread_1')
    await router.isReady()

    const wrapper = mount(ThreadDetailView, {
      global: { plugins: [pinia, router] },
      attachTo: document.body,
    })
    await flushPromises()

    expect(wrapper.find('[role="status"][aria-label="Loading thread…"]').exists()).toBe(true)
    expect(wrapper.find('[role="status"]').classes()).toContain('animate-pulse')
  })

  it('hides skeleton and renders signals once loaded', async () => {
    const wrapper = await mountView(mockThread(), [mockEmailSignal()])
    expect(wrapper.find('[role="status"][aria-label="Loading thread…"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Test subject')
  })

  it('shows error banner when signal fetch fails', async () => {
    vi.mocked(api.getThread).mockResolvedValue(ok(mockThread()))
    vi.mocked(api.listSignals).mockRejectedValue(new Error('Network failed'))
    vi.mocked(api.listResourcesByThread).mockResolvedValue(ok({ resources: [], pagination: { cursor: null } }))

    const router = makeRouter()
    await router.push('/threads/thread_1')
    await router.isReady()

    const wrapper = mount(ThreadDetailView, {
      global: { plugins: [pinia, router] },
      attachTo: document.body,
    })
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').text()).toContain('Network failed')
  })

  // ── Pagination ───────────────────────────────────────────────────────────
  it('shows "Load earlier messages" when cursor is present', async () => {
    const wrapper = await mountView(mockThread(), [mockEmailSignal()], { cursor: 'page2' })
    const btn = wrapper.findAll('button').find(b => b.text().includes('Load earlier messages'))
    expect(btn).toBeTruthy()
  })

  it('hides load more button when no cursor', async () => {
    const wrapper = await mountView(mockThread(), [mockEmailSignal()])
    const btn = wrapper.findAll('button').find(b => b.text().includes('Load earlier messages'))
    expect(btn).toBeUndefined()
  })

  it('fetches next page on load more click', async () => {
    const sig2 = { ...mockEmailSignal(), signalId: 'sig_2', createdAt: '2024-12-01T12:00:00Z', data: { ...mockEmailSignal().data, receivedAt: '2024-12-01T12:00:00Z', subject: 'Older subject', body: 'Completely different body text here' } } as Signal
    vi.mocked(api.getThread).mockResolvedValue(ok(mockThread()))
    vi.mocked(api.listSignals)
      .mockResolvedValueOnce(ok({ signals: [mockEmailSignal()], pagination: { cursor: 'page2' } }))
      .mockResolvedValueOnce(ok({ signals: [sig2], pagination: { cursor: null } }))
    vi.mocked(api.listResourcesByThread).mockResolvedValue(ok({ resources: [], pagination: { cursor: null } }))

    const router = makeRouter()
    await router.push('/threads/thread_1')
    await router.isReady()
    const wrapper = mount(ThreadDetailView, { global: { plugins: [pinia, router] }, attachTo: document.body })
    await flushPromises()

    const btn = wrapper.findAll('button').find(b => b.text().includes('Load earlier messages'))!
    await btn.trigger('click')
    await flushPromises()

    expect(api.listSignals).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Older subject')
  })

  // ── Draft create ─────────────────────────────────────────────────────────
  it('creates draft with reply context on Reply click', async () => {
    const draft = mockDraftSignal()
    vi.mocked(api.createDraftSignal).mockResolvedValue(ok(draft))
    vi.mocked(api.updateDraftSignal).mockResolvedValue(ok(draft))

    const wrapper = await mountView(mockThread(), [mockEmailSignal()])
    vi.mocked(api.listSignals).mockResolvedValue(ok({ signals: [mockEmailSignal(), draft], pagination: { cursor: null } }))

    const replyBtn = wrapper.findAll('button').find(b => b.text().includes('Reply'))!
    await replyBtn.trigger('click')
    await flushPromises()

    expect(api.createDraftSignal).toHaveBeenCalledWith('acc_1', 'thread_1', expect.objectContaining({
      from: { address: 'inbox@example.com' },
      to: [{ address: 'sender@example.com' }],
      subject: 'Re: Test subject',
    }))
  })

  it('renders DraftSignalCard after draft creation', async () => {
    const draft = mockDraftSignal()
    vi.mocked(api.createDraftSignal).mockResolvedValue(ok(draft))
    vi.mocked(api.updateDraftSignal).mockResolvedValue(ok(draft))

    const wrapper = await mountView(mockThread(), [mockEmailSignal()])
    vi.mocked(api.listSignals).mockResolvedValue(ok({ signals: [mockEmailSignal(), draft], pagination: { cursor: null } }))

    const replyBtn = wrapper.findAll('button').find(b => b.text().includes('Reply'))!
    await replyBtn.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Draft')
  })

  // ── Send action ──────────────────────────────────────────────────────────
  it('shows Send + Archive button when draft has body content', async () => {
    const draft = { ...mockDraftSignal(), data: { ...mockDraftSignal().data, body: 'Hello back' } } as Signal
    vi.mocked(api.updateDraftSignal).mockResolvedValue(ok(draft))

    const wrapper = await mountView(mockThread(), [mockEmailSignal(), draft])
    const sendBtn = wrapper.findAll('button').find(b => b.text().includes('Send + Archive'))
    expect(sendBtn).toBeTruthy()
    expect(sendBtn!.attributes('disabled')).toBeUndefined()
  })

  it('disables send when draft body is empty', async () => {
    const draft = mockDraftSignal()
    vi.mocked(api.updateDraftSignal).mockResolvedValue(ok(draft))

    const wrapper = await mountView(mockThread(), [mockEmailSignal(), draft])
    const sendBtn = wrapper.findAll('button').find(b => b.text().includes('Send + Archive'))
    expect(sendBtn).toBeTruthy()
    expect(sendBtn!.attributes('disabled')).toBeDefined()
  })

  // ── RSVP action ──────────────────────────────────────────────────────────
  it('renders Accept/Tentative/Decline for calendar event signal', async () => {
    const wrapper = await mountView(mockThread(), [mockCalendarEventSignal()])
    expect(wrapper.text()).toContain('Accept')
    expect(wrapper.text()).toContain('Tentative')
    expect(wrapper.text()).toContain('Decline')
  })

  it('calls rsvpSignal on Accept and shows confirmation', async () => {
    const updated = { ...mockCalendarEventSignal(), status: 'active' } as Signal
    vi.mocked(api.rsvpSignal).mockResolvedValue(ok(updated))

    const wrapper = await mountView(mockThread(), [mockCalendarEventSignal()])
    const acceptBtn = wrapper.findAll('button').find(b => b.text().trim() === 'Accept')!
    await acceptBtn.trigger('click')
    await flushPromises()

    expect(api.rsvpSignal).toHaveBeenCalledWith('acc_1', 'thread_1', 'sig_cal_1', 'accepted')
    expect(wrapper.text()).toContain('accepted')
  })

  it('calls rsvpSignal with "declined" on Decline click', async () => {
    const updated = { ...mockCalendarEventSignal(), status: 'active' } as Signal
    vi.mocked(api.rsvpSignal).mockResolvedValue(ok(updated))

    const wrapper = await mountView(mockThread(), [mockCalendarEventSignal()])
    const declineBtn = wrapper.findAll('button').find(b => b.text().trim() === 'Decline')!
    await declineBtn.trigger('click')
    await flushPromises()

    expect(api.rsvpSignal).toHaveBeenCalledWith('acc_1', 'thread_1', 'sig_cal_1', 'declined')
    expect(wrapper.text()).toContain('declined')
  })
})
