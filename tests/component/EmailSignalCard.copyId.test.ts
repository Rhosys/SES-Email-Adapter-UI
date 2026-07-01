import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import EmailSignalCard from '@/components/EmailSignalCard.vue'
import { useAccountStore } from '@/stores/account'
import { useToast } from '@/composables/useToast'
import type { Signal } from '@/types/server'

function mockEmailSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    signalId: 'sig_1',
    arcId: 'arc_1',
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
    routes: [{ path: '/arcs/:id', name: 'arc-detail', component: { template: '<div />' } }],
  })
}

let pinia: ReturnType<typeof createPinia>
const writeText = vi.fn().mockResolvedValue(undefined)

async function mountCard(signal: Signal) {
  const router = makeRouter()
  await router.push('/arcs/arc_1')
  await router.isReady()

  const wrapper = mount(EmailSignalCard, {
    props: { signal },
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  })

  await wrapper.find('[aria-label="Signal actions"]').trigger('click')
  return wrapper
}

describe('EmailSignalCard — copy IDs (mobile menu)', () => {
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

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    useToast().toasts.value = []
  })

  it('copies the signal ID and shows a confirmation toast', async () => {
    const wrapper = await mountCard(mockEmailSignal())
    const button = wrapper.findAll('button').find((b) => b.text() === 'Copy Signal ID')!
    await button.trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('sig_1')
    expect(useToast().toasts.value.some((t) => t.message === 'Signal ID copied')).toBe(true)
  })

  it('copies the thread ID and shows a confirmation toast', async () => {
    const wrapper = await mountCard(mockEmailSignal({ arcId: 'arc_1' }))
    const button = wrapper.findAll('button').find((b) => b.text() === 'Copy Thread ID')!
    await button.trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('arc_1')
    expect(useToast().toasts.value.some((t) => t.message === 'Thread ID copied')).toBe(true)
  })

  it('hides "Copy Thread ID" when the signal has no thread (e.g. quarantined)', async () => {
    const wrapper = await mountCard(mockEmailSignal({ arcId: undefined, status: 'quarantine_visible' }))
    expect(wrapper.findAll('button').some((b) => b.text() === 'Copy Thread ID')).toBe(false)
  })
})
