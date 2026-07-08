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

  it('renders a clickable chip with filename and size for an attachment with a URL', async () => {
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

    const chip = wrapper.findAll('button').find((b) => b.text().includes('invoice.pdf'))!
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('20.0 KB')
  })

  it('shows an unavailable state (not clickable) when the attachment has no URL', async () => {
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

    expect(wrapper.findAll('button').some((b) => b.text().includes('photo.png'))).toBe(false)
    expect(wrapper.text()).toContain('photo.png')
    expect(wrapper.text()).toContain('Unavailable')
  })

  it('renders no attachment chips when there are no attachments', async () => {
    const wrapper = await mountCard(mockEmailSignal())
    expect(wrapper.text()).not.toContain('Unavailable')
  })

  it('opens a preview modal with an image and a download link when clicking an image attachment', async () => {
    const wrapper = await mountCard(
      mockEmailSignal({
        data: {
          ...mockEmailSignal().data,
          attachments: [
            { attachmentId: 'att_3', filename: 'photo.png', mimeType: 'image/png', sizeBytes: 2048, url: 'https://cdn.example.com/att_3' },
          ],
        },
      } as Partial<Signal>),
    )

    const chip = wrapper.findAll('button').find((b) => b.text().includes('photo.png'))!
    await chip.trigger('click')

    const img = document.body.querySelector('img[src="https://cdn.example.com/att_3"]')
    expect(img).not.toBeNull()

    const downloadLink = document.body.querySelector('a[href="https://cdn.example.com/att_3"]')
    expect(downloadLink).not.toBeNull()
    expect(downloadLink!.getAttribute('download')).toBe('photo.png')
  })

  it('renders a PDF preview in an iframe when clicking a PDF attachment', async () => {
    const wrapper = await mountCard(
      mockEmailSignal({
        data: {
          ...mockEmailSignal().data,
          attachments: [
            { attachmentId: 'att_4', filename: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: 20480, url: 'https://cdn.example.com/att_4' },
          ],
        },
      } as Partial<Signal>),
    )

    const chip = wrapper.findAll('button').find((b) => b.text().includes('invoice.pdf'))!
    await chip.trigger('click')

    const iframe = document.body.querySelector('iframe[src="https://cdn.example.com/att_4"]')
    expect(iframe).not.toBeNull()
  })

  it('shows a "no preview available" fallback for an unsupported file type', async () => {
    const wrapper = await mountCard(
      mockEmailSignal({
        data: {
          ...mockEmailSignal().data,
          attachments: [
            { attachmentId: 'att_5', filename: 'report.csv', mimeType: 'text/csv', sizeBytes: 4200, url: 'https://cdn.example.com/att_5' },
          ],
        },
      } as Partial<Signal>),
    )

    const chip = wrapper.findAll('button').find((b) => b.text().includes('report.csv'))!
    await chip.trigger('click')

    expect(document.body.querySelector('img[src="https://cdn.example.com/att_5"]')).toBeNull()
    expect(document.body.querySelector('iframe[src="https://cdn.example.com/att_5"]')).toBeNull()
    expect(document.body.textContent).toContain('No preview available')
  })

  it('closes the preview modal when clicking Close', async () => {
    const wrapper = await mountCard(
      mockEmailSignal({
        data: {
          ...mockEmailSignal().data,
          attachments: [
            { attachmentId: 'att_6', filename: 'photo.png', mimeType: 'image/png', sizeBytes: 2048, url: 'https://cdn.example.com/att_6' },
          ],
        },
      } as Partial<Signal>),
    )

    const chip = wrapper.findAll('button').find((b) => b.text().includes('photo.png'))!
    await chip.trigger('click')
    expect(document.body.querySelector('img[src="https://cdn.example.com/att_6"]')).not.toBeNull()

    const closeButtons = Array.from(document.body.querySelectorAll('button')).filter((b) => b.textContent === 'Close')
    ;(closeButtons[closeButtons.length - 1] as HTMLElement).click()
    await wrapper.vm.$nextTick()

    expect(document.body.querySelector('img[src="https://cdn.example.com/att_6"]')).toBeNull()
  })
})
