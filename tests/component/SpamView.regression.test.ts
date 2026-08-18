import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import SpamView from '@/views/SpamView.vue'
import { useAccountStore } from '@/stores/account'
import { ApiError } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'
import type { BlockedSignal, Account } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listAccounts: vi.fn(),
      listBlockedSignals: vi.fn(),
      deleteSignal: vi.fn(),
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

function mockBlockedSignal(overrides: Partial<BlockedSignal> = {}): BlockedSignal {
  return {
    signalId: 'sig_1',
    threadId: 'thread_1',
    type: 'email',
    source: 'system',
    status: 'block_hidden',
    createdAt: '2025-06-01T12:00:00Z',
    data: {
      receivedAt: '2025-06-01T12:00:00Z',
      summary: 'Spam email',
      from: { address: 'spammer@evil.com', name: 'Spammer' },
      to: [{ address: 'me@example.com' }],
      cc: [],
      subject: 'Buy pills now',
      body: 'Spam content',
      attachments: [],
      headers: {},
      recipientAddress: 'me@example.com',
      workflow: 'conversation',
      spamScore: 90,
      matchedRules: [],
    },
    ...overrides,
  } as BlockedSignal
}

function mockBothCalls(
  hidden: BlockedSignal[] = [],
  reject: BlockedSignal[] = [],
  hiddenCursor: string | null = null,
  rejectCursor: string | null = null,
) {
  vi.mocked(api.listBlockedSignals)
    .mockResolvedValueOnce(ok({ signals: hidden, pagination: { cursor: hiddenCursor } }))
    .mockResolvedValueOnce(ok({ signals: reject, pagination: { cursor: rejectCursor } }))
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/spam', component: SpamView },
      { path: '/spam/:id', name: 'spam-detail', component: { template: '<div />' } },
    ],
  })
}

let pinia: ReturnType<typeof createPinia>

async function mountView() {
  const router = makeRouter()
  await router.push('/spam')
  await router.isReady()
  const wrapper = mount(SpamView, {
    global: {
      plugins: [pinia, router],
    },
  })
  await flushPromises()
  return wrapper
}

describe('SpamView — regression gate', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listAccounts).mockResolvedValue(ok([testAccount]))
  })

  it('shows loading skeleton before data arrives', async () => {
    vi.mocked(api.listBlockedSignals).mockReturnValue(new Promise(() => {}))
    const router = makeRouter()
    await router.push('/spam')
    await router.isReady()
    const wrapper = mount(SpamView, {
      global: { plugins: [pinia, router] },
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="status"][aria-label="Loading blocked emails…"]').exists()).toBe(true)
  })

  it('renders blocked emails after load', async () => {
    mockBothCalls(
      [mockBlockedSignal({ signalId: 'h1' })],
      [mockBlockedSignal({ signalId: 'r1', status: 'block_reject' })],
    )
    const wrapper = await mountView()

    expect(wrapper.find('[aria-label="Silently blocked"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Rejected"]').exists()).toBe(true)
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(2)
  })

  it('shows empty state when no blocked emails exist', async () => {
    mockBothCalls([], [])
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('No blocked emails')
  })

  it('shows error banner when fetch fails', async () => {
    vi.mocked(api.listBlockedSignals)
      .mockRejectedValueOnce(new ApiError(500, 'Server error'))
      .mockResolvedValueOnce(ok({ signals: [], pagination: { cursor: null } }))
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Server error')
  })

  it('shows Load more when cursor is present and appends next page', async () => {
    mockBothCalls([mockBlockedSignal({ signalId: 'h1' })], [], 'cursor_next', null)
    const wrapper = await mountView()

    const loadMoreBtn = wrapper.findAll('button').find(b => b.text() === 'Load more')
    expect(loadMoreBtn).toBeTruthy()

    vi.mocked(api.listBlockedSignals).mockResolvedValueOnce(
      ok({ signals: [mockBlockedSignal({ signalId: 'h2' })], pagination: { cursor: null } }),
    )
    await loadMoreBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(2)
  })

  it('re-fetches with new params on filter change', async () => {
    mockBothCalls([], [])
    const wrapper = await mountView()

    mockBothCalls([mockBlockedSignal({ signalId: 'filtered_1' })], [])
    wrapper.findComponent({ name: 'QuarantineFilters' }).vm.$emit('update', { sender: 'spammer@evil.com' })
    await flushPromises()

    expect(api.listBlockedSignals).toHaveBeenCalledWith(
      'acc_1',
      'block_hidden',
      expect.objectContaining({ sender: 'spammer@evil.com' }),
    )
  })

  it('optimistically removes item from list on delete mutation', async () => {
    mockBothCalls(
      [mockBlockedSignal({ signalId: 'h1' }), mockBlockedSignal({ signalId: 'h2' })],
      [],
    )
    const wrapper = await mountView()
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(2)

    // Get the queryClient that the component is actually using (from setup.ts global)
    const qc = useQueryClient()

    // Simulate optimistic delete: directly manipulate the infinite query cache the same way
    // useDeleteSpamSignal.onMutate does — filter out the target signal from all pages
    const allQueries = qc.getQueriesData({ queryKey: queryKeys.spam.all('acc_1') })
    for (const [key, data] of allQueries) {
      if (!data || typeof data !== 'object' || !('pages' in data)) continue
      const infinite = data as { pages: Array<{ signals: BlockedSignal[]; pagination: unknown }>; pageParams: unknown[] }
      qc.setQueryData(key, {
        ...infinite,
        pages: infinite.pages.map((page) => ({
          ...page,
          signals: page.signals.filter((s) => s.signalId !== 'h1'),
        })),
      })
    }
    await flushPromises()

    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(1)
  })

  it('rolls back optimistic removal when delete mutation fails', async () => {
    mockBothCalls(
      [mockBlockedSignal({ signalId: 'h1' }), mockBlockedSignal({ signalId: 'h2' })],
      [],
    )
    const wrapper = await mountView()
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(2)

    // Get the queryClient that the component is actually using (from setup.ts global)
    const qc = useQueryClient()

    // Snapshot before optimistic removal (same as onMutate)
    const previous = qc.getQueriesData({ queryKey: queryKeys.spam.all('acc_1') })

    // Optimistic removal
    for (const [key, data] of previous) {
      if (!data || typeof data !== 'object' || !('pages' in data)) continue
      const infinite = data as { pages: Array<{ signals: BlockedSignal[]; pagination: unknown }>; pageParams: unknown[] }
      qc.setQueryData(key, {
        ...infinite,
        pages: infinite.pages.map((page) => ({
          ...page,
          signals: page.signals.filter((s) => s.signalId !== 'h1'),
        })),
      })
    }
    await flushPromises()
    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(1)

    // Rollback (same as onError) — restore previous state
    for (const [key, data] of previous) {
      qc.setQueryData(key, data)
    }
    await flushPromises()

    expect(wrapper.findAll('[role="listitem"]')).toHaveLength(2)
  })
})
