import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
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

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/quarantine', component: { template: '<div>quarantine list</div>' } },
      { path: '/quarantine/:id', name: 'quarantine-detail', component: QuarantineDetailView },
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
})
