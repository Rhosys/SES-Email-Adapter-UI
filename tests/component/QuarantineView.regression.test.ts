import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok, err } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import QuarantineView from '@/views/QuarantineView.vue'
import { useAccountStore } from '@/stores/account'
import { ApiError } from '@/lib/api'
import type { QuarantinedSignal, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listAccounts: vi.fn(),
      listQuarantinedSignals: vi.fn(),
      quarantineResponse: vi.fn(),
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

function mockBothCalls(
  visible: QuarantinedSignal[] = [],
  hidden: QuarantinedSignal[] = [],
  visCursor: string | null = null,
  hidCursor: string | null = null,
) {
  vi.mocked(api.listQuarantinedSignals)
    .mockResolvedValueOnce(ok({ signals: visible, pagination: { cursor: visCursor } }))
    .mockResolvedValueOnce(ok({ signals: hidden, pagination: { cursor: hidCursor } }))
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/quarantine', component: QuarantineView },
      { path: '/quarantine/:id', name: 'quarantine-detail', component: { template: '<div />' } },
    ],
  })
}

let pinia: ReturnType<typeof createPinia>
let queryClient: QueryClient

async function mountView() {
  const router = makeRouter()
  await router.push('/quarantine')
  await router.isReady()
  const wrapper = mount(QuarantineView, {
    global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient }]] },
  })
  await flushPromises()
  return wrapper
}

describe('QuarantineView — regression gate', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listAccounts).mockResolvedValue(ok([testAccount]))
  })

  it('shows loading skeleton before data arrives', async () => {
    vi.mocked(api.listQuarantinedSignals).mockReturnValue(new Promise(() => {}))
    const router = makeRouter()
    await router.push('/quarantine')
    await router.isReady()
    const wrapper = mount(QuarantineView, {
      global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient }]] },
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="status"][aria-label="Loading quarantine…"]').exists()).toBe(true)
  })

  it('renders quarantined emails in their respective sections', async () => {
    mockBothCalls(
      [mockQuarantinedSignal({ signalId: 'v1' })],
      [mockQuarantinedSignal({ signalId: 'h1', status: 'quarantine_hidden' })],
    )
    const wrapper = await mountView()

    expect(wrapper.find('[aria-label="Needs review"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Silently held"]').exists()).toBe(true)
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(2)
  })

  it('shows empty state when no quarantined emails exist', async () => {
    mockBothCalls([], [])
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('No emails waiting for review')
  })

  it('shows error banner when fetch fails', async () => {
    vi.mocked(api.listQuarantinedSignals)
      .mockResolvedValueOnce(err(new ApiError(500, 'Server error')))
      .mockResolvedValueOnce(ok({ signals: [], pagination: { cursor: null } }))
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Server error')
  })

  it('re-fetches on filter change', async () => {
    mockBothCalls([], [])
    const wrapper = await mountView()

    mockBothCalls([mockQuarantinedSignal({ signalId: 'filtered_1' })], [])
    wrapper.findComponent({ name: 'QuarantineFilters' }).vm.$emit('update', { sender: 'foo@bar.com' })
    await flushPromises()

    // Filter change produces new query key → new fetch
    expect(api.listQuarantinedSignals).toHaveBeenCalledWith(
      'acc_1',
      'quarantine_visible',
      expect.objectContaining({ sender: 'foo@bar.com' }),
    )
  })
})
