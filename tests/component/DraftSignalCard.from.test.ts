import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { ok, type Result } from 'neverthrow'
import DraftSignalCard from '@/components/DraftSignalCard.vue'
import { useAccountStore } from '@/stores/account'
import type { ApiError } from '@/lib/api'
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

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'inbox', component: { template: '<div />' } },
      { path: '/settings/email-forwarding', name: 'settings', component: { template: '<div />' } },
    ],
  })
}

/** Mounts without awaiting the sender-identity fetches — for asserting what's on
 *  screen before that background request resolves. */
async function mountCardUnflushed(signal: Signal) {
  const router = makeRouter()
  await router.push('/')
  await router.isReady()
  return mount(DraftSignalCard, { props: { signal }, global: { plugins: [pinia, router] } })
}

async function mountCard(signal: Signal) {
  const wrapper = await mountCardUnflushed(signal)
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountCard>>

/** Opens the sender editor the way a user does — via the pencil. */
async function editFrom(wrapper: Wrapper) {
  await wrapper.find('[aria-label="Change sender address"]').trigger('click')
  await flushPromises()
}

function fromSelect(wrapper: Wrapper) {
  return wrapper.find('#draft-from')
}

/** A promise the test controls the resolution of, for the three sender-identity calls. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe('DraftSignalCard — From address', () => {
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

    vi.mocked(api.listDomains).mockResolvedValue(ok([makeDomain('demo.app'), makeDomain('other.app')]))
    vi.mocked(api.listAliases).mockResolvedValue(
      ok([makeAlias('hello@demo.app'), makeAlias('work@demo.app'), makeAlias('sales@other.app')]),
    )
    vi.mocked(api.listExternalExchanges).mockResolvedValue(
      ok([
        makeExchange('ada@imap-host.example', 'imap'),
        makeExchange('ada@jmap-host.example', 'jmap'),
        makeExchange('ada@gmail.example', 'gmail'),
        makeExchange('ada@outlook.example', 'outlook'),
      ]),
    )
  })

  it('renders the fixed address synchronously, before the sender-identity fetch resolves', async () => {
    const domainsPending = deferred<Result<Domain[], ApiError>>()
    vi.mocked(api.listDomains).mockReturnValue(domainsPending.promise)

    const wrapper = await mountCardUnflushed(makeDraft('work@demo.app'))

    // No await between mount and this assertion — the fetch is still in flight.
    expect(wrapper.text()).toContain('work@demo.app')
    expect(fromSelect(wrapper).exists()).toBe(false)

    domainsPending.resolve(ok([makeDomain('demo.app')]))
    await flushPromises()
  })

  it('warms the shared sender-identities cache in the background on mount, once', async () => {
    await mountCard(makeDraft('work@demo.app'))

    expect(api.listDomains).toHaveBeenCalledTimes(1)
    expect(api.listAliases).toHaveBeenCalledTimes(1)
    expect(api.listExternalExchanges).toHaveBeenCalledTimes(1)
  })

  it('opens the editor instantly once the background fetch has already resolved', async () => {
    const wrapper = await mountCard(makeDraft('work@demo.app'))
    await editFrom(wrapper)

    expect(fromSelect(wrapper).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Loading addresses…')
    // The pencil click didn't trigger a second round of fetches.
    expect(api.listDomains).toHaveBeenCalledTimes(1)
  })

  it('shows a brief loading state if the pencil is clicked before the fetch resolves', async () => {
    const domainsPending = deferred<Result<Domain[], ApiError>>()
    vi.mocked(api.listDomains).mockReturnValue(domainsPending.promise)

    const wrapper = await mountCardUnflushed(makeDraft('work@demo.app'))
    await wrapper.find('[aria-label="Change sender address"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Loading addresses…')
    expect(fromSelect(wrapper).exists()).toBe(false)

    domainsPending.resolve(ok([makeDomain('demo.app')]))
    await flushPromises()

    expect(wrapper.text()).not.toContain('Loading addresses…')
    expect(fromSelect(wrapper).exists()).toBe(true)
  })

  it('offers connected mailboxes of every platform, not just IMAP/JMAP', async () => {
    const wrapper = await mountCard(makeDraft('work@demo.app'))
    await editFrom(wrapper)

    const options = fromSelect(wrapper).findAll('option').map((o) => o.text())
    expect(options).toContain('ada@imap-host.example')
    expect(options).toContain('ada@jmap-host.example')
    expect(options).toContain('ada@gmail.example')
    expect(options).toContain('ada@outlook.example')
  })

  it('suggests only the aliases on the selected domain', async () => {
    const wrapper = await mountCard(makeDraft('work@demo.app'))
    await editFrom(wrapper)

    const suggestions = wrapper.find('#draft-from-aliases').findAll('option')
      .map((o) => o.attributes('value'))
    expect(suggestions).toEqual(['hello', 'work'])

    await wrapper.find('[aria-label="Domain"]').setValue('other.app')
    const afterSwitch = wrapper.find('#draft-from-aliases').findAll('option')
      .map((o) => o.attributes('value'))
    expect(afterSwitch).toEqual(['sales'])
  })

  it('opens the editor on the matching connected mailbox', async () => {
    const wrapper = await mountCard(makeDraft('ada@gmail.example'))
    await editFrom(wrapper)

    expect((fromSelect(wrapper).element as HTMLSelectElement).value).toBe('ada@gmail.example')
  })

  it('opens the domain editor prefilled for an address on a verified domain', async () => {
    const wrapper = await mountCard(makeDraft('catch-all@demo.app'))
    await editFrom(wrapper)

    expect((fromSelect(wrapper).element as HTMLSelectElement).value).toBe('__custom__')
    expect((wrapper.find('#draft-from-local').element as HTMLInputElement).value).toBe('catch-all')
  })

  it('applies the edited address and returns to the fixed display', async () => {
    const wrapper = await mountCard(makeDraft('work@demo.app'))
    await editFrom(wrapper)

    await wrapper.find('#draft-from-local').setValue('billing')
    await wrapper.findAll('button').find((b) => b.text() === 'Use this address')!.trigger('click')
    await flushPromises()

    expect(fromSelect(wrapper).exists()).toBe(false)
    expect(wrapper.text()).toContain('billing@demo.app')
  })

  it('keeps the original address when the edit is cancelled', async () => {
    const wrapper = await mountCard(makeDraft('work@demo.app'))
    await editFrom(wrapper)

    await wrapper.find('#draft-from-local').setValue('billing')
    await wrapper.findAll('button').find((b) => b.text() === 'Cancel')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('work@demo.app')
    expect(wrapper.text()).not.toContain('billing@demo.app')
  })

  it('skips mailboxes that failed activation', async () => {
    vi.mocked(api.listExternalExchanges).mockResolvedValue(
      ok([makeExchange('broken@imap-host.example', 'imap', 'activation_failed')]),
    )
    const wrapper = await mountCard(makeDraft('work@demo.app'))
    await editFrom(wrapper)

    const options = fromSelect(wrapper).findAll('option').map((o) => o.text())
    expect(options).not.toContain('broken@imap-host.example')
  })

  it('warns instead of offering a picker when nothing can send', async () => {
    vi.mocked(api.listDomains).mockResolvedValue(ok([makeDomain('demo.app', false)]))
    vi.mocked(api.listExternalExchanges).mockResolvedValue(ok([]))
    const wrapper = await mountCard(makeDraft('work@demo.app'))
    await editFrom(wrapper)

    expect(fromSelect(wrapper).exists()).toBe(false)
    expect(wrapper.text()).toContain('No verified sending address.')
  })
})
