import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import ThreadDetailView from '@/views/ThreadDetailView.vue'
import { useAccountStore } from '@/stores/account'
import { useToast } from '@/composables/useToast'
import type { Thread, Signal } from '@/types/server'

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
      listDomains: vi.fn(),
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
  })

  it('creates a draft on first reply, then reuses it instead of creating a second one', async () => {
    const thread = makeThread()
    const wrapper = await mountView(thread, [mockEmailSignal()])
    vi.mocked(api.createDraftSignal).mockResolvedValue(ok(mockDraftSignal()))

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
