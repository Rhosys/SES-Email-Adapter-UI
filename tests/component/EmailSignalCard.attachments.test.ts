import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import EmailSignalCard from '@/components/EmailSignalCard.vue'
import { useAccountStore } from '@/stores/account'
import type { Signal } from '@/types/server'

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
    routes: [{ path: '/threads/:id', name: 'thread-detail', component: { template: '<div />' } }],
  })
}

let pinia: ReturnType<typeof createPinia>

async function mountCard(signal: Signal) {
  const router = makeRouter()
  await router.push('/threads/thread_1')
  await router.isReady()

  return mount(EmailSignalCard, {
    props: { signal },
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  })
}

describe('EmailSignalCard — attachments', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)

    const accountStore = useAccountStore()
    accountStore.account = {
      accountId: 'acc_1',
      name: 'Test',
      filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
  })

  it('renders a download link with filename and size for an attachment with a URL', async () => {
    const wrapper = await mountCard(
      mockEmailSignal({
        data: {
          ...mockEmailSignal().data,
          attachments: [
            { attachmentId: 'att_1', filename: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: 20480, url: 'https://cdn.example.com/att_1' },
          ],
        },
      } as Partial<Signal>),
    )

    const link = wrapper.find('a[href="https://cdn.example.com/att_1"]')
    expect(link.exists()).toBe(true)
    expect(link.text()).toContain('invoice.pdf')
    expect(link.text()).toContain('20.0 KB')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
  })

  it('shows an unavailable state (not a link) when the attachment has no URL', async () => {
    const wrapper = await mountCard(
      mockEmailSignal({
        data: {
          ...mockEmailSignal().data,
          attachments: [
            { attachmentId: 'att_2', filename: 'photo.png', mimeType: 'image/png', sizeBytes: 512, url: undefined },
          ],
        },
      } as Partial<Signal>),
    )

    expect(wrapper.find('a[href]').exists()).toBe(false)
    expect(wrapper.text()).toContain('photo.png')
    expect(wrapper.text()).toContain('Unavailable')
  })

  it('renders nothing when there are no attachments', async () => {
    const wrapper = await mountCard(mockEmailSignal())
    expect(wrapper.find('a[href]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Unavailable')
  })
})
