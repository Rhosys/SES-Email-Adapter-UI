import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { ok } from 'neverthrow'
import DraftSignalCard from '@/components/DraftSignalCard.vue'
import { useAccountStore } from '@/stores/account'
import type { Alias, Domain, ExternalMailExchange, Signal } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listDomains: vi.fn(),
      listAliases: vi.fn(),
      listExternalExchanges: vi.fn(),
      updateDraftSignal: vi.fn(),
      deleteDraftSignal: vi.fn(),
      sendSignal: vi.fn(),
      patchThread: vi.fn(),
    },
  }
})

import { api } from '@/lib/api'

function makeDomain(domain: string, senderSetupComplete = true): Domain {
  return {
    domainId: `dom_${domain}`,
    domain,
    receivingSetupComplete: true,
    senderSetupComplete,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  }
}

function makeAlias(alias: string): Alias {
  return {
    alias,
    unknownSenderPolicy: 'allow_all',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  }
}

function makeExchange(
  emailAddress: string,
  platform: ExternalMailExchange['platform'],
  status: ExternalMailExchange['status'] = 'active',
): ExternalMailExchange {
  return {
    exchangeId: `emx_${emailAddress}`,
    accountId: 'acc_1',
    platform,
    emailAddress,
    status,
    syncCursor: null,
    lastSyncAt: null,
    nextSyncTime: null,
    createdAt: '2025-01-01T00:00:00Z',
  }
}

function makeDraft(fromAddress: string): Signal {
  return {
    signalId: 'sig_draft',
    threadId: 'thread_1',
    type: 'email',
    source: 'user',
    status: 'draft',
    createdAt: '2025-01-01T12:00:00Z',
    data: {
      from: { address: fromAddress },
      to: [{ address: 'sender@example.com' }],
      cc: [],
      bcc: [],
      subject: 'Re: Hello',
      body: '',
      attachments: [],
      sendInitiatedAt: '',
    },
  } as Signal
}

let pinia: ReturnType<typeof createPinia>

async function mountCard(signal: Signal) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'inbox', component: { template: '<div />' } },
      { path: '/settings/email-forwarding', name: 'settings', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()

  const wrapper = mount(DraftSignalCard, {
    props: { signal },
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return wrapper
}

function fromSelect(wrapper: Awaited<ReturnType<typeof mountCard>>) {
  return wrapper.find('#draft-from')
}

describe('DraftSignalCard — From address selection', () => {
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

    vi.mocked(api.listDomains).mockResolvedValue(ok([makeDomain('demo.app')]))
    vi.mocked(api.listAliases).mockResolvedValue(
      ok([makeAlias('hello@demo.app'), makeAlias('work@demo.app')]),
    )
    vi.mocked(api.listExternalExchanges).mockResolvedValue(
      ok([
        makeExchange('ada@imap-host.example', 'imap'),
        makeExchange('ada@jmap-host.example', 'jmap'),
      ]),
    )
  })

  it('auto-selects the alias the email was originally addressed to', async () => {
    const wrapper = await mountCard(makeDraft('work@demo.app'))
    expect((fromSelect(wrapper).element as HTMLSelectElement).value).toBe('work@demo.app')
    expect(wrapper.find('#draft-from-local').exists()).toBe(false)
  })

  it('offers IMAP and JMAP mailboxes and auto-selects the matching one', async () => {
    const wrapper = await mountCard(makeDraft('ada@jmap-host.example'))
    const options = fromSelect(wrapper).findAll('option').map((o) => o.text())
    expect(options).toContain('ada@imap-host.example')
    expect(options).toContain('ada@jmap-host.example')
    expect((fromSelect(wrapper).element as HTMLSelectElement).value).toBe('ada@jmap-host.example')
  })

  it('falls back to the custom editor for an unregistered address on a verified domain', async () => {
    const wrapper = await mountCard(makeDraft('catch-all@demo.app'))
    expect((fromSelect(wrapper).element as HTMLSelectElement).value).toBe('__custom__')
    expect((wrapper.find('#draft-from-local').element as HTMLInputElement).value).toBe('catch-all')
  })

  it('falls back to the first known address when the original recipient is unusable', async () => {
    const wrapper = await mountCard(makeDraft('nobody@unknown.example'))
    expect((fromSelect(wrapper).element as HTMLSelectElement).value).toBe('hello@demo.app')
  })

  it('skips mailboxes that failed activation', async () => {
    vi.mocked(api.listExternalExchanges).mockResolvedValue(
      ok([makeExchange('broken@imap-host.example', 'imap', 'activation_failed')]),
    )
    const wrapper = await mountCard(makeDraft('hello@demo.app'))
    const options = fromSelect(wrapper).findAll('option').map((o) => o.text())
    expect(options).not.toContain('broken@imap-host.example')
  })

  it('warns instead of offering a picker when nothing can send', async () => {
    vi.mocked(api.listDomains).mockResolvedValue(ok([makeDomain('demo.app', false)]))
    vi.mocked(api.listExternalExchanges).mockResolvedValue(ok([]))
    const wrapper = await mountCard(makeDraft('hello@demo.app'))
    expect(fromSelect(wrapper).exists()).toBe(false)
    expect(wrapper.text()).toContain('No verified sending address.')
  })
})
