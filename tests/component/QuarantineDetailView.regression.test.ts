import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import QuarantineDetailView from '@/views/QuarantineDetailView.vue'
import { useAccountStore } from '@/stores/account'
import type { QuarantinedSignal, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listAccounts: vi.fn(),
      listQuarantinedSignals: vi.fn(),
      listRules: vi.fn(),
      quarantineResponse: vi.fn(),
      getThread: vi.fn(),
    },
  }
})

import { api, ApiError } from '@/lib/api'
import { useToast } from '@/composables/useToast'

const testAccount: Account = {
  accountId: 'acc_1',
  name: 'Test',
  filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
}

function mockQuarantinedSignal(overrides: Partial<QuarantinedSignal> = {}): QuarantinedSignal {
  return {
    signalId: 'sig_1',
    threadId: 'thread_1',
    type: 'email',
    source: 'system',
    status: 'quarantine_visible',
    createdAt: '2025-06-01T12:00:00Z',
    data: {
      receivedAt: '2025-06-01T12:00:00Z',
      summary: 'Unknown sender',
      from: { address: 'unknown@sender.com', name: 'Unknown' },
      to: [{ address: 'me@example.com' }],
      cc: [],
      subject: 'Hello from a stranger',
      body: 'First contact',
      attachments: [],
      headers: {},
      recipientAddress: 'me@example.com',
      workflow: 'conversation',
      spamScore: 20,
      matchedRules: [],
    },
    ...overrides,
  } as QuarantinedSignal
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/quarantine', component: { template: '<div>quarantine list</div>' } },
      { path: '/quarantine/:id', name: 'quarantine-detail', component: QuarantineDetailView },
      { path: '/threads/:id', name: 'thread-detail', component: { template: '<div>thread</div>' } },
    ],
  })
}

let pinia: ReturnType<typeof createPinia>

async function mountView(signal: QuarantinedSignal) {
  vi.mocked(api.listQuarantinedSignals).mockImplementation(async (_accountId, status) =>
    ok({
      signals: status === signal.status ? [signal] : [],
      pagination: { cursor: null },
    }),
  )
  vi.mocked(api.listRules).mockResolvedValue(ok([]))

  const router = makeRouter()
  await router.push(`/quarantine/${signal.signalId}`)
  await router.isReady()
  const wrapper = mount(QuarantineDetailView, {
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('QuarantineDetailView — regression gate', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listAccounts).mockResolvedValue(ok([testAccount]))
  })

  it('navigates back to the quarantine list after dismiss', async () => {
    const signal = mockQuarantinedSignal()
    vi.mocked(api.quarantineResponse).mockResolvedValue(ok({}))
    const { wrapper, router } = await mountView(signal)

    const dismissBtn = wrapper.findAll('button').find((b) => b.text().includes('Dismiss'))!
    await dismissBtn.trigger('click')
    await flushPromises()

    expect(api.quarantineResponse).toHaveBeenCalledWith('acc_1', 'sig_1', 'dismiss')
    expect(router.currentRoute.value.path).toBe('/quarantine')
  })

  it('navigates back to the quarantine list after reject', async () => {
    const signal = mockQuarantinedSignal()
    vi.mocked(api.quarantineResponse).mockResolvedValue(ok({}))
    const { wrapper, router } = await mountView(signal)

    const rejectBtn = wrapper.findAll('button').find((b) => b.text().includes('Reject') || b.text().includes('Block'))!
    await rejectBtn.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/quarantine')
  })

  it('navigates to the new thread page after allow', async () => {
    const signal = mockQuarantinedSignal()
    vi.mocked(api.quarantineResponse).mockResolvedValue(ok({ thread: { threadId: 'thread_42' } }))
    const { wrapper, router } = await mountView(signal)

    const allowBtn = wrapper.findAll('button').find((b) => b.text().includes('Allow'))!
    await allowBtn.trigger('click')
    await flushPromises()

    expect(api.quarantineResponse).toHaveBeenCalledWith('acc_1', 'sig_1', 'active')
    expect(router.currentRoute.value.path).toBe('/threads/thread_42')
  })

  // ── Loader while a decision is in flight ──

  function deferred<T>() {
    let resolve!: (v: T) => void
    const promise = new Promise<T>((r) => { resolve = r })
    return { promise, resolve }
  }
  const loader = (w: ReturnType<typeof mount>) => w.find('[data-testid="quarantine-detail-loader"]')
  const button = (w: ReturnType<typeof mount>, label: string) => w.findAll('button').find((b) => b.text().includes(label))!

  const actions = [
    { label: 'Allow', status: 'active', response: { thread: { threadId: 'thread_42' } }, path: '/threads/thread_42' },
    { label: 'Reject', status: 'block_reject', response: {}, path: '/quarantine' },
    { label: 'Dismiss', status: 'dismiss', response: {}, path: '/quarantine' },
  ] as const

  it.each(actions)('shows the standard loader for the whole $label request, then navigates', async ({ label, response, path }) => {
    const signal = mockQuarantinedSignal()
    const pending = deferred<unknown>()
    vi.mocked(api.quarantineResponse).mockReturnValue(pending.promise as never)
    vi.mocked(api.getThread).mockResolvedValue(err(new ApiError(404, 'n/a')))
    const { wrapper, router } = await mountView(signal)
    expect(loader(wrapper).exists()).toBe(false)

    await button(wrapper, label).trigger('click')
    await flushPromises()

    // In flight: the optimistic removal has taken the signal out of the cache, yet the page shows
    // the loader — never a blank page and never the "no longer in quarantine" message.
    expect(loader(wrapper).exists()).toBe(true)
    expect(loader(wrapper).attributes('aria-label')).toBe('Applying your decision…')
    expect(wrapper.text()).not.toContain('no longer in quarantine')
    expect(router.currentRoute.value.path).toBe('/quarantine/sig_1')

    pending.resolve(ok(response))
    await flushPromises()

    expect(router.currentRoute.value.path).toBe(path)
  })

  it.each(actions)('keeps the loader up while the queue refetches after $label (cascade), then navigates', async ({ label, response, path }) => {
    const signal = mockQuarantinedSignal()
    vi.mocked(api.quarantineResponse).mockResolvedValue(ok(response))
    vi.mocked(api.getThread).mockResolvedValue(err(new ApiError(404, 'n/a')))
    const { wrapper, router } = await mountView(signal)
    const listCallsBefore = vi.mocked(api.listQuarantinedSignals).mock.calls.length
    const refetch = deferred<unknown>()
    vi.mocked(api.listQuarantinedSignals).mockReturnValue(refetch.promise as never)

    await button(wrapper, label).trigger('click')
    await flushPromises()

    expect(vi.mocked(api.listQuarantinedSignals).mock.calls.length).toBeGreaterThan(listCallsBefore)
    expect(loader(wrapper).exists()).toBe(true)
    expect(router.currentRoute.value.path).toBe('/quarantine/sig_1')

    refetch.resolve(ok({ signals: [], pagination: { cursor: null } }))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(path)
  })

  // ── Errors are surfaced, never dropped ──

  it.each(actions)('on a failed $label: hides the loader, restores the signal, stays put, and toasts the error', async ({ label, status }) => {
    const signal = mockQuarantinedSignal()
    vi.mocked(api.quarantineResponse).mockResolvedValue(err(new ApiError(500, 'Internal Server Error')))
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const { toasts } = useToast()
    toasts.value = []
    const { wrapper, router } = await mountView(signal)

    await button(wrapper, label).trigger('click')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))

    expect(api.quarantineResponse).toHaveBeenCalledWith('acc_1', 'sig_1', status)
    expect(loader(wrapper).exists()).toBe(false)
    expect(wrapper.text()).toContain('Hello from a stranger')
    expect(router.currentRoute.value.path).toBe('/quarantine/sig_1')
    expect(button(wrapper, label).attributes('disabled')).toBeUndefined()
    expect(toasts.value.map((t) => t.message).join('\n')).toContain('Internal Server Error')
    expect(unhandled).not.toHaveBeenCalled()
    process.off('unhandledRejection', unhandled)
  })

  it('on a network failure (no status) the toast still names the failure', async () => {
    vi.mocked(api.quarantineResponse).mockResolvedValue(err(new ApiError(0, 'Network error')))
    const { toasts } = useToast()
    toasts.value = []
    const { wrapper } = await mountView(mockQuarantinedSignal())

    await button(wrapper, 'Allow').trigger('click')
    await flushPromises()

    expect(toasts.value.map((t) => t.message).join('\n')).toContain('Network error')
  })

  it('allow with no thread in the response stays on the page and clears the loader', async () => {
    vi.mocked(api.quarantineResponse).mockResolvedValue(ok({}))
    const { wrapper, router } = await mountView(mockQuarantinedSignal())

    await button(wrapper, 'Allow').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/quarantine/sig_1')
    expect(loader(wrapper).exists()).toBe(false)
  })

  it('disables every action while one is in flight so a second decision cannot race the first', async () => {
    const pending = deferred<unknown>()
    vi.mocked(api.quarantineResponse).mockReturnValue(pending.promise as never)
    const { wrapper } = await mountView(mockQuarantinedSignal())

    await button(wrapper, 'Allow').trigger('click')
    await flushPromises()

    // The action buttons are gone behind the loader — nothing else can be clicked.
    expect(wrapper.findAll('button').some((b) => /Allow|Reject|Dismiss/.test(b.text()))).toBe(false)
    expect(api.quarantineResponse).toHaveBeenCalledTimes(1)
    pending.resolve(ok({ thread: { threadId: 'thread_42' } }))
    await flushPromises()
  })
})
