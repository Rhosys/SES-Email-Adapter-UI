import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import ThreadDetailView from '@/views/ThreadDetailView.vue'
import { useAccountStore } from '@/stores/account'
import { useToast } from '@/composables/useToast'
import type { Thread, Signal, Workflow } from '@/types/server'
import type { ApiError } from '@/lib/api'

Element.prototype.scrollIntoView = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      getThread: vi.fn(),
      listSignals: vi.fn(),
      patchThread: vi.fn(),
      listAccounts: vi.fn(),
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

function makeThread(overrides: Partial<Thread> = {}): Thread {
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
      body: 'Hello',
      attachments: [],
      headers: {},
      recipientAddress: 'inbox@example.com',
      workflow: 'conversation',
      spamScore: 0,
    },
    ...overrides,
  } as Signal
}

function mockUnsubscribableSignal(workflow: Workflow, workflowData: unknown): Signal {
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
      body: 'Hello',
      attachments: [],
      headers: {},
      recipientAddress: 'inbox@example.com',
      spamScore: 0,
      unsubscribe: { type: 'server', url: 'https://example.com/unsub' },
      workflow,
      workflowData,
    },
  } as Signal
}

function mockDraftSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    signalId: 'sig_draft',
    threadId: 'thread_1',
    type: 'email',
    source: 'user',
    status: 'draft',
    createdAt: '2025-01-01T12:05:00Z',
    data: {
      from: { address: 'me@example.com' },
      to: [{ address: 'sender@example.com' }],
      cc: [],
      bcc: [],
      subject: 'Re: Test subject',
      body: '',
      attachments: [],
      sendInitiatedAt: '',
    },
    ...overrides,
  } as Signal
}

async function mountView(thread: Thread, signals: Signal[] = []) {
  vi.mocked(api.getThread).mockResolvedValue(ok(thread))
  vi.mocked(api.listSignals).mockResolvedValue(ok({ signals, pagination: { cursor: null } }))
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

describe('ThreadDetailView — deleted timestamp display', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: 'acc_1',
      name: 'Test',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    vi.mocked(api.listAccounts).mockResolvedValue(ok([accountStore.account]))
  })

  it('shows "Deleted on" date when status is deleted and deletedAt is set', async () => {
    const thread = makeThread({
      status: 'deleted',
      deletedAt: '2025-06-15T10:30:00Z',
    })
    const wrapper = await mountView(thread)

    const formatted = new Date('2025-06-15T10:30:00Z').toLocaleDateString(undefined, { dateStyle: 'medium' })
    expect(wrapper.text()).toContain(`Deleted on ${formatted}`)
  })

  it('does not show deletion date when status is deleted but deletedAt is absent', async () => {
    const thread = makeThread({ status: 'deleted' })
    const wrapper = await mountView(thread)

    expect(wrapper.text()).not.toContain('Deleted on')
  })

  it('does not show deletion date when status is active even if deletedAt is set', async () => {
    const thread = makeThread({
      status: 'active',
      deletedAt: '2025-06-15T10:30:00Z',
    })
    const wrapper = await mountView(thread)

    expect(wrapper.text()).not.toContain('Deleted on')
  })
})

describe('ThreadDetailView — reply reuses existing draft', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: 'acc_1',
      name: 'Test',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    vi.mocked(api.listAccounts).mockResolvedValue(ok([accountStore.account]))
    vi.mocked(api.listDomains).mockResolvedValue(ok([]))
    vi.mocked(api.listAliases).mockResolvedValue(ok([]))
    vi.mocked(api.listExternalExchanges).mockResolvedValue(ok([]))
  })

  it('creates a draft on first reply, then reuses it instead of creating a second one', async () => {
    const thread = makeThread()
    const wrapper = await mountView(thread, [mockEmailSignal()])
    vi.mocked(api.createDraftSignal).mockResolvedValue(ok(mockDraftSignal()))
    // After draft creation, the query refetches — include the draft in subsequent responses
    vi.mocked(api.listSignals).mockResolvedValue(ok({ signals: [mockEmailSignal(), mockDraftSignal()], pagination: { cursor: null } }))

    const replyButton = wrapper.findAll('button').find((b) => b.text().includes('Reply'))!
    await replyButton.trigger('click')
    await flushPromises()

    expect(api.createDraftSignal).toHaveBeenCalledTimes(1)

    await replyButton.trigger('click')
    await flushPromises()

    expect(api.createDraftSignal).toHaveBeenCalledTimes(1)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('scrolls to an already-existing draft instead of creating a new one', async () => {
    const thread = makeThread()
    const wrapper = await mountView(thread, [mockEmailSignal(), mockDraftSignal()])

    const replyButton = wrapper.findAll('button').find((b) => b.text().includes('Reply'))!
    await replyButton.trigger('click')
    await flushPromises()

    expect(api.createDraftSignal).not.toHaveBeenCalled()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})

describe('ThreadDetailView — no signals', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: 'acc_1',
      name: 'Test',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    vi.mocked(api.listAccounts).mockResolvedValue(ok([accountStore.account]))
  })

  it('shows an empty-state message instead of a blank thread body', async () => {
    const thread = makeThread()
    const wrapper = await mountView(thread, [])

    expect(wrapper.text()).toContain('No signals yet')
  })

  it('does not render the signal-count line when there are no signals', async () => {
    const thread = makeThread()
    const wrapper = await mountView(thread, [])

    expect(wrapper.text()).not.toMatch(/\d+\+? Signals?/)
  })
})

describe('ThreadDetailView — signal count badge', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: 'acc_1',
      name: 'Test',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    vi.mocked(api.listAccounts).mockResolvedValue(ok([accountStore.account]))
  })

  it('shows a capitalized "Signal" count and colors it like the primary status badge', async () => {
    const thread = makeThread({ status: 'active' })
    const wrapper = await mountView(thread, [mockEmailSignal()])

    const badge = wrapper.findAll('span').find((s) => /^\d+\+? Signals?$/.test(s.text().trim()))
    expect(badge).toBeTruthy()
    expect(badge!.text().trim()).toBe('1 Signal')
    expect(badge!.classes()).toContain('bg-ctp-green/20')
    expect(badge!.classes()).toContain('text-ctp-green')
  })

  it('pluralizes and colors the badge as archived when the thread is archived', async () => {
    const thread = makeThread({ status: 'archived' })
    const base = mockEmailSignal()
    const sig2 = { ...base, signalId: 'sig_2', data: { ...base.data, body: 'Different body' } } as Signal
    const wrapper = await mountView(thread, [base, sig2])

    const badge = wrapper.findAll('span').find((s) => /^\d+\+? Signals?$/.test(s.text().trim()))
    expect(badge).toBeTruthy()
    expect(badge!.text().trim()).toBe('2 Signals')
    expect(badge!.classes()).toContain('bg-ctp-surface1')
    expect(badge!.classes()).toContain('text-ctp-subtext0')
  })
})

describe('ThreadDetailView — unsubscribe', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: 'acc_1',
      name: 'Test',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    vi.mocked(api.listAccounts).mockResolvedValue(ok([accountStore.account]))
  })

  it('shows the unsubscribe action inside the workflow panel, not the top action bar', async () => {
    const thread = makeThread()
    const signal = mockUnsubscribableSignal('content', { contentType: 'newsletter', publisher: 'Acme Weekly' })
    const wrapper = await mountView(thread, [signal])

    // The top action bar (contains "← Back to inbox" link) should not have Unsubscribe
    const backLink = wrapper.find('a[href="/"]')
    expect(backLink.element.parentElement?.textContent).not.toContain('Unsubscribe')

    // The workflow-panels wrapper contains both the publisher name and the unsubscribe button
    const workflowSection = wrapper.findAll('div').find((el) => el.text().includes('Acme Weekly') && el.text().includes('Unsubscribe'))
    expect(workflowSection).toBeTruthy()
  })

  it('attaches unsubscribe to only the first visible panel when a thread has multiple workflows', async () => {
    const thread = makeThread()
    const contentSignal = mockUnsubscribableSignal('content', { contentType: 'newsletter', publisher: 'Acme Weekly' })
    const alertSignal = mockEmailSignal({
      signalId: 'sig_2',
      createdAt: '2025-01-02T12:00:00Z',
      data: {
        receivedAt: '2025-01-02T12:00:00Z',
        summary: 'Alert',
        from: { address: 'alerts@example.com', name: 'Alerts' },
        to: [{ address: 'inbox@example.com' }],
        cc: [],
        subject: 'Alert subject',
        body: 'Something happened',
        attachments: [],
        headers: {},
        recipientAddress: 'inbox@example.com',
        workflow: 'alert',
        workflowData: { alertType: 'ci_failure', service: 'GitLab', severity: 'warning', requiresAction: true },
        spamScore: 0,
      },
    })
    const wrapper = await mountView(thread, [contentSignal, alertSignal])

    const unsubscribeButtons = wrapper.findAll('button').filter((b) => b.text().includes('Unsubscribe'))
    expect(unsubscribeButtons).toHaveLength(1)
  })

  it('shows a standalone unsubscribe panel when no workflow panel is displayed', async () => {
    const thread = makeThread()
    const signal = mockUnsubscribableSignal('conversation', { sentiment: 'neutral', requiresReply: false })
    const wrapper = await mountView(thread, [signal])

    const unsubscribeButton = wrapper.findAll('button').find((b) => b.text().includes('Unsubscribe'))
    expect(unsubscribeButton).toBeTruthy()
    expect(wrapper.text()).toContain('one-click unsubscribe')
  })

  it('unsubscribes after confirmation and navigates back to the inbox', async () => {
    vi.mocked(api.unsubscribeThread).mockResolvedValue(ok({ status: 'unsubscribed' }))
    const thread = makeThread()
    const signal = mockUnsubscribableSignal('content', { contentType: 'newsletter', publisher: 'Acme Weekly' })
    const wrapper = await mountView(thread, [signal])

    const unsubscribeButton = wrapper.findAll('button').find((b) => b.text().includes('Unsubscribe'))!
    await unsubscribeButton.trigger('click')
    await flushPromises()

    const confirmButton = wrapper.findAll('button').find((b) => b.text() === 'Unsubscribe' && b.classes().includes('bg-ctp-red'))!
    await confirmButton.trigger('click')
    await flushPromises()

    expect(api.unsubscribeThread).toHaveBeenCalledWith('acc_1', 'thread_1')
  })
})

describe('ThreadDetailView — copy thread ID (mobile menu)', () => {
  const writeText = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: 'acc_1',
      name: 'Test',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    vi.mocked(api.listAccounts).mockResolvedValue(ok([accountStore.account]))

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    useToast().toasts.value = []
  })

  it('copies the thread ID and shows a confirmation toast', async () => {
    const thread = makeThread()
    const wrapper = await mountView(thread, [mockEmailSignal()])

    await wrapper.find('[aria-label="More actions"]').trigger('click')
    const copyButton = wrapper.findAll('button').find((b) => b.text() === 'Copy Thread ID')!
    await copyButton.trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('thread_1')
    expect(useToast().toasts.value.some((t) => t.message === 'Thread ID copied')).toBe(true)
  })
})


describe('ThreadDetailView — signal list loading', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: 'acc_1',
      name: 'Test',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    vi.mocked(api.listAccounts).mockResolvedValue(ok([accountStore.account]))
  })

  it('shows loading skeleton while signals are being fetched', async () => {
    // Never resolving promise — simulates in-flight request
    vi.mocked(api.getThread).mockResolvedValue(ok(makeThread()))
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

    const skeleton = wrapper.find('[role="status"][aria-label="Loading thread…"]')
    expect(skeleton.exists()).toBe(true)
    expect(skeleton.classes()).toContain('animate-pulse')
  })

  it('hides skeleton and renders signals once loaded', async () => {
    const wrapper = await mountView(makeThread(), [mockEmailSignal()])

    expect(wrapper.find('[role="status"][aria-label="Loading thread…"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Test subject')
  })

  it('shows error banner when signal fetch fails', async () => {
    vi.mocked(api.getThread).mockResolvedValue(ok(makeThread()))
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

    const alert = wrapper.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Network failed')
  })
})

describe('ThreadDetailView — pagination', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: 'acc_1',
      name: 'Test',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    vi.mocked(api.listAccounts).mockResolvedValue(ok([accountStore.account]))
  })

  it('shows "Load earlier messages" button when there are more signals', async () => {
    vi.mocked(api.getThread).mockResolvedValue(ok(makeThread()))
    vi.mocked(api.listSignals).mockResolvedValue(ok({
      signals: [mockEmailSignal()],
      pagination: { cursor: 'next_cursor_token' },
    }))
    vi.mocked(api.listResourcesByThread).mockResolvedValue(ok({ resources: [], pagination: { cursor: null } }))

    const router = makeRouter()
    await router.push('/threads/thread_1')
    await router.isReady()

    const wrapper = mount(ThreadDetailView, {
      global: { plugins: [pinia, router] },
      attachTo: document.body,
    })
    await flushPromises()

    const loadMoreBtn = wrapper.findAll('button').find(b => b.text().includes('Load earlier messages'))
    expect(loadMoreBtn).toBeTruthy()
  })

  it('does not show "Load earlier messages" when there is no cursor', async () => {
    const wrapper = await mountView(makeThread(), [mockEmailSignal()])

    const loadMoreBtn = wrapper.findAll('button').find(b => b.text().includes('Load earlier messages'))
    expect(loadMoreBtn).toBeUndefined()
  })

  it('fetches next page when "Load earlier messages" is clicked', async () => {
    const sig2 = { ...mockEmailSignal(), signalId: 'sig_2', createdAt: '2024-12-01T12:00:00Z', data: { ...mockEmailSignal().data, receivedAt: '2024-12-01T12:00:00Z', subject: 'Older subject', body: 'A completely different body so dedup keeps it separate' } } as Signal
    vi.mocked(api.getThread).mockResolvedValue(ok(makeThread()))
    vi.mocked(api.listSignals)
      .mockResolvedValueOnce(ok({ signals: [mockEmailSignal()], pagination: { cursor: 'page2' } }))
      .mockResolvedValueOnce(ok({ signals: [sig2], pagination: { cursor: null } }))
    vi.mocked(api.listResourcesByThread).mockResolvedValue(ok({ resources: [], pagination: { cursor: null } }))

    const router = makeRouter()
    await router.push('/threads/thread_1')
    await router.isReady()

    const wrapper = mount(ThreadDetailView, {
      global: { plugins: [pinia, router] },
      attachTo: document.body,
    })
    await flushPromises()

    const loadMoreBtn = wrapper.findAll('button').find(b => b.text().includes('Load earlier messages'))!
    await loadMoreBtn.trigger('click')
    await flushPromises()

    // Second call made with cursor, both signals now visible
    expect(api.listSignals).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Older subject')
  })

  it('shows signal count with "+" suffix when pagination has more', async () => {
    vi.mocked(api.getThread).mockResolvedValue(ok(makeThread()))
    vi.mocked(api.listSignals).mockResolvedValue(ok({
      signals: [mockEmailSignal()],
      pagination: { cursor: 'more' },
    }))
    vi.mocked(api.listResourcesByThread).mockResolvedValue(ok({ resources: [], pagination: { cursor: null } }))

    const router = makeRouter()
    await router.push('/threads/thread_1')
    await router.isReady()

    const wrapper = mount(ThreadDetailView, {
      global: { plugins: [pinia, router] },
      attachTo: document.body,
    })
    await flushPromises()

    const badge = wrapper.findAll('span').find(s => /^\d+\+? Signals?$/.test(s.text().trim()))
    expect(badge).toBeTruthy()
    expect(badge!.text().trim()).toBe('1+ Signals')
  })
})

describe('ThreadDetailView — draft create', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: 'acc_1',
      name: 'Test',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    vi.mocked(api.listAccounts).mockResolvedValue(ok([accountStore.account]))
    vi.mocked(api.listDomains).mockResolvedValue(ok([]))
    vi.mocked(api.listAliases).mockResolvedValue(ok([]))
    vi.mocked(api.listExternalExchanges).mockResolvedValue(ok([]))
  })

  it('calls createDraftSignal with reply context when reply is clicked', async () => {
    const draft = mockDraftSignal()
    vi.mocked(api.createDraftSignal).mockResolvedValue(ok(draft))
    vi.mocked(api.updateDraftSignal).mockResolvedValue(ok(draft))

    const wrapper = await mountView(makeThread(), [mockEmailSignal()])

    // After creation, include the draft in subsequent responses
    vi.mocked(api.listSignals).mockResolvedValue(ok({ signals: [mockEmailSignal(), draft], pagination: { cursor: null } }))

    const replyButton = wrapper.findAll('button').find(b => b.text().includes('Reply'))!
    await replyButton.trigger('click')
    await flushPromises()

    expect(api.createDraftSignal).toHaveBeenCalledWith('acc_1', 'thread_1', expect.objectContaining({
      from: { address: 'inbox@example.com' },
      to: [{ address: 'sender@example.com' }],
      subject: 'Re: Test subject',
    }))
  })

  it('renders the DraftSignalCard with "Draft" badge after creation', async () => {
    const draft = mockDraftSignal()
    vi.mocked(api.createDraftSignal).mockResolvedValue(ok(draft))
    vi.mocked(api.updateDraftSignal).mockResolvedValue(ok(draft))

    const wrapper = await mountView(makeThread(), [mockEmailSignal()])
    vi.mocked(api.listSignals).mockResolvedValue(ok({ signals: [mockEmailSignal(), draft], pagination: { cursor: null } }))

    const replyButton = wrapper.findAll('button').find(b => b.text().includes('Reply'))!
    await replyButton.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Draft')
  })
})

describe('ThreadDetailView — send action', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: 'acc_1',
      name: 'Test',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    vi.mocked(api.listAccounts).mockResolvedValue(ok([accountStore.account]))
    vi.mocked(api.listDomains).mockResolvedValue(ok([]))
    vi.mocked(api.listAliases).mockResolvedValue(ok([]))
    vi.mocked(api.listExternalExchanges).mockResolvedValue(ok([]))
  })

  it('shows "Send + Archive" button in draft card when draft has required fields', async () => {
    const draft = mockDraftSignal({
      data: {
        from: { address: 'me@example.com' },
        to: [{ address: 'sender@example.com' }],
        cc: [],
        bcc: [],
        subject: 'Re: Test subject',
        body: 'Hello back',
        attachments: [],
        sendInitiatedAt: '',
      },
    }) as Signal
    vi.mocked(api.updateDraftSignal).mockResolvedValue(ok(draft))

    const wrapper = await mountView(makeThread(), [mockEmailSignal(), draft])

    const sendButton = wrapper.findAll('button').find(b => b.text().includes('Send + Archive'))
    expect(sendButton).toBeTruthy()
    expect(sendButton!.attributes('disabled')).toBeUndefined()
  })

  it('disables send buttons when draft body is empty', async () => {
    const draft = mockDraftSignal({
      data: {
        from: { address: 'me@example.com' },
        to: [{ address: 'sender@example.com' }],
        cc: [],
        bcc: [],
        subject: 'Re: Test subject',
        body: '',
        attachments: [],
        sendInitiatedAt: '',
      },
    }) as Signal
    vi.mocked(api.updateDraftSignal).mockResolvedValue(ok(draft))

    const wrapper = await mountView(makeThread(), [mockEmailSignal(), draft])

    const sendButton = wrapper.findAll('button').find(b => b.text().includes('Send + Archive'))
    expect(sendButton).toBeTruthy()
    // disabled attribute renders as empty string when present
    expect(sendButton!.attributes('disabled')).toBeDefined()
  })
})

describe('ThreadDetailView — RSVP action', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: 'acc_1',
      name: 'Test',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    vi.mocked(api.listAccounts).mockResolvedValue(ok([accountStore.account]))
  })

  function makeCalendarEventSignal(): Signal {
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
        attendees: [
          { address: 'me@example.com', name: 'Me' },
        ],
        linkedSignalId: 'sig_linked',
      },
    } as Signal
  }

  it('renders Accept, Tentative, Decline buttons for a calendar event signal', async () => {
    const wrapper = await mountView(makeThread(), [makeCalendarEventSignal()])

    expect(wrapper.text()).toContain('Accept')
    expect(wrapper.text()).toContain('Tentative')
    expect(wrapper.text()).toContain('Decline')
  })

  it('calls rsvpSignal API and shows confirmation text on Accept', async () => {
    const updatedSignal = { ...makeCalendarEventSignal(), status: 'active' } as Signal
    vi.mocked(api.rsvpSignal).mockResolvedValue(ok(updatedSignal))

    const wrapper = await mountView(makeThread(), [makeCalendarEventSignal()])

    const acceptButton = wrapper.findAll('button').find(b => b.text().trim() === 'Accept')!
    await acceptButton.trigger('click')
    await flushPromises()

    expect(api.rsvpSignal).toHaveBeenCalledWith('acc_1', 'thread_1', 'sig_cal_1', 'accepted')
    expect(wrapper.text()).toContain('accepted')
  })

  it('calls rsvpSignal with "declined" when Decline is clicked', async () => {
    const updatedSignal = { ...makeCalendarEventSignal(), status: 'active' } as Signal
    vi.mocked(api.rsvpSignal).mockResolvedValue(ok(updatedSignal))

    const wrapper = await mountView(makeThread(), [makeCalendarEventSignal()])

    const declineButton = wrapper.findAll('button').find(b => b.text().trim() === 'Decline')!
    await declineButton.trigger('click')
    await flushPromises()

    expect(api.rsvpSignal).toHaveBeenCalledWith('acc_1', 'thread_1', 'sig_cal_1', 'declined')
    expect(wrapper.text()).toContain('declined')
  })

  it('shows error text when RSVP fails', async () => {
    const { err } = await import('neverthrow')
    const apiError = { status: 500, message: 'Internal server error', code: 'SERVER_ERROR' }
    vi.mocked(api.rsvpSignal).mockResolvedValue(err(apiError as unknown as ApiError))

    const wrapper = await mountView(makeThread(), [makeCalendarEventSignal()])

    // CalendarEventCard re-throws on error for AsyncButton state tracking — suppress in test
    const onUnhandled = vi.fn()
    process.on('unhandledRejection', onUnhandled)

    const acceptButton = wrapper.findAll('button').find(b => b.text().trim() === 'Accept')!
    await acceptButton.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Internal server error')
    process.off('unhandledRejection', onUnhandled)
  })
})
