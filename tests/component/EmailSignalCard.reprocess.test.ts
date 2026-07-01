import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import EmailSignalCard from '@/components/EmailSignalCard.vue'
import { useAccountStore } from '@/stores/account'
import { ApiError } from '@/lib/api'
import type { Result } from 'neverthrow'
import type { ApiError as ApiErrorType } from '@/lib/api'
import type { Signal } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      reprocessSignal: vi.fn(),
    },
  }
})

import { api } from '@/lib/api'

const ADMIN_ACCOUNT_ID = 'acc-t8cmlkkck3vtm'

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
      body: '<p>Hello</p>',
      attachments: [],
      headers: {},
      recipientAddress: 'inbox@example.com',
      workflow: 'conversation',
      spamScore: 0,
    },
    ...overrides,
  } as Signal
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'inbox', component: { template: '<div />' } },
      { path: '/threads/:id', name: 'thread-detail', component: { template: '<div />' } },
      { path: '/quarantine/:id', name: 'quarantine-detail', component: { template: '<div />' } },
    ],
  })
}

let pinia: ReturnType<typeof createPinia>

async function mountCard(signal: Signal, startPath = '/threads/thread_1') {
  const router = makeRouter()
  await router.push(startPath)
  await router.isReady()

  const wrapper = mount(EmailSignalCard, {
    props: { signal },
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  })

  // Open the overflow menu and click the admin reprocess action
  await wrapper.find('[aria-label="Signal actions"]').trigger('click')
  const reprocessButton = wrapper.findAll('button').find((b) => b.text().includes('[Admin] Reprocess'))!
  await reprocessButton.trigger('click')

  return { wrapper, router }
}

describe('EmailSignalCard — admin reprocess', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: ADMIN_ACCOUNT_ID,
      name: 'Admin',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
  })

  it('shows a loader in place of the iframe while reprocessing', async () => {
    let resolveReprocess: (v: Result<Signal, ApiErrorType>) => void = () => {}
    vi.mocked(api.reprocessSignal).mockReturnValue(new Promise((resolve) => { resolveReprocess = resolve }))

    const { wrapper } = await mountCard(mockEmailSignal())

    expect(wrapper.find('[role="status"][aria-label="Reprocessing email…"]').exists()).toBe(true)
    expect(wrapper.find('iframe').exists()).toBe(false)

    resolveReprocess(ok(mockEmailSignal()))
    await flushPromises()
  })

  it('shows an error alert in place of the iframe when reprocessing fails', async () => {
    vi.mocked(api.reprocessSignal).mockResolvedValue(err(new ApiError(500, 'Reprocess blew up')))

    const { wrapper } = await mountCard(mockEmailSignal())
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Reprocess blew up')
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.find('[role="status"][aria-label="Reprocessing email…"]').exists()).toBe(false)
  })

  it('redirects to the new thread when reprocessing moves the signal to a different thread', async () => {
    vi.mocked(api.reprocessSignal).mockResolvedValue(ok(mockEmailSignal({ threadId: 'thread_2' })))

    const { wrapper, router } = await mountCard(mockEmailSignal())
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/threads/thread_2')
    expect(wrapper.emitted('reprocessed')).toBeUndefined()
  })

  it('redirects to quarantine when reprocessing leaves the signal with no thread', async () => {
    vi.mocked(api.reprocessSignal).mockResolvedValue(
      ok(mockEmailSignal({ threadId: undefined, status: 'quarantine_visible' })),
    )

    const { router } = await mountCard(mockEmailSignal())
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/quarantine/sig_1')
  })

  it('redirects to the inbox when the signal is blocked or reported', async () => {
    vi.mocked(api.reprocessSignal).mockResolvedValue(
      ok(mockEmailSignal({ threadId: undefined, status: 'report_violation' })),
    )

    const { router } = await mountCard(mockEmailSignal())
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/')
  })

  it('emits reprocessed and restores the iframe when the signal stays in the same thread', async () => {
    vi.mocked(api.reprocessSignal).mockResolvedValue(ok(mockEmailSignal({ threadId: 'thread_1' })))

    const { wrapper, router } = await mountCard(mockEmailSignal())
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/threads/thread_1')
    expect(wrapper.emitted('reprocessed')).toHaveLength(1)
    expect(wrapper.find('[role="status"][aria-label="Reprocessing email…"]').exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
