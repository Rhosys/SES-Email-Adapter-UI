import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import EmailSignalCard from '@/components/EmailSignalCard.vue'
import { useAccountStore } from '@/stores/account'
import type { Signal } from '@/types/server'

// SECURITY GUARD — the email body iframe renders UNTRUSTED email HTML. Adding
// `allow-scripts` (arbitrary JS in the user's session) or `allow-same-origin`
// (makes the frame same-site, so our domain cookies ride along on any request
// the email triggers — a no-JS CSRF vector) would be a serious regression.
// This test exists so such a change fails CI instead of shipping silently.
// See the SECURITY comment in EmailSignalCard.vue for the full rationale.

function mockEmailSignal(): Signal {
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
  } as Signal
}

function mountCard() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/threads/:id', name: 'thread-detail', component: { template: '<div />' } }],
  })
  return mount(EmailSignalCard, {
    props: { signal: mockEmailSignal(), defaultExpanded: true },
    global: { plugins: [createPinia(), router] },
  })
}

describe('EmailSignalCard — email iframe sandbox', () => {
  beforeEach(() => {
    const pinia = createPinia()
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

  it('renders the email body in a sandboxed iframe', () => {
    const iframe = mountCard().find('iframe[title="Email content"]')
    expect(iframe.exists()).toBe(true)
    expect(iframe.attributes('sandbox')).toBeDefined()
  })

  it('never grants allow-scripts or allow-same-origin to untrusted email HTML', () => {
    const iframe = mountCard().find('iframe[title="Email content"]')
    const sandbox = iframe.attributes('sandbox') ?? ''
    const tokens = sandbox.split(/\s+/).filter(Boolean)

    expect(tokens, 'email iframe must not allow scripts — see SECURITY note in EmailSignalCard.vue')
      .not.toContain('allow-scripts')
    expect(tokens, 'email iframe must not allow same-origin — see SECURITY note in EmailSignalCard.vue')
      .not.toContain('allow-same-origin')
  })

  it('keeps the sandbox pinned to the reviewed allowlist', () => {
    // Exact match so widening the sandbox is a deliberate, reviewed change.
    const iframe = mountCard().find('iframe[title="Email content"]')
    expect(iframe.attributes('sandbox')).toBe('allow-popups allow-popups-to-escape-sandbox')
  })
})
