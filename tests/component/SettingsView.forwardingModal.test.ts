import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import SettingsView from '@/views/SettingsView.vue'
import { useAccountStore } from '@/stores/account'
import { useToast } from '@/composables/useToast'
import type { Account, ForwardingTarget } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listAccounts: vi.fn(),
      listDomains: vi.fn(),
      listForwardingAddresses: vi.fn(),
      createForwardingAddress: vi.fn(),
      deleteForwardingAddress: vi.fn(),
      updateAccount: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth', () => ({
  loginClient: {
    getUserIdentity: vi.fn(() => null),
    getUserProfile: vi.fn(() => Promise.resolve({ linkedIdentities: [] })),
    getDevices: vi.fn(() => Promise.resolve([])),
  },
}))

import { api } from '@/lib/api'

const verifiedEmail: ForwardingTarget = {
  target: 'existing@example.com',
  type: 'email',
  status: 'verified',
  createdAt: '2025-01-01T00:00:00Z',
  verifiedAt: '2025-01-02T00:00:00Z',
}

function testAccount(overrides: Partial<Account> = {}): Account {
  return {
    accountId: 'acc_1',
    name: 'Test',
    filtering: { defaultUnknownSenderPolicy: 'quarantine_visible' },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/settings', component: SettingsView }],
  })
}

let pinia: ReturnType<typeof createPinia>

async function mountSettings(query: Record<string, string>, account: Account) {
  vi.mocked(api.listForwardingAddresses).mockResolvedValue(ok([verifiedEmail]))
  vi.mocked(api.listAccounts).mockResolvedValue(ok([account]))
  vi.mocked(api.listDomains).mockResolvedValue(ok([]))

  const router = makeRouter()
  await router.push({ path: '/settings', query })
  await router.isReady()

  const wrapper = mount(SettingsView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

describe('SettingsView — forwarding target add modal', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    useAccountStore().account = testAccount()
    // Drain any toasts left over from a previous test (module-level singleton).
    const { toasts, dismiss } = useToast()
    ;[...toasts.value].forEach((t) => dismiss(t.id))
  })

  it('opens the modal and switches to Email & Forwarding when "＋ Add new…" is picked in the digest select (Profile tab)', async () => {
    vi.mocked(api.updateAccount).mockResolvedValue(ok(testAccount({ digest: { frequency: 'daily', forwardingTargetId: '' } })))
    const wrapper = await mountSettings({ tab: 'profile' }, testAccount())
    // The "Send to" select only appears once the digest is enabled.
    await wrapper.get('[aria-label="Enable digest"]').trigger('click')
    await flushPromises()

    const digestSelect = wrapper.get('#digest-target')
    await digestSelect.setValue('__add_new_forwarding_target__')
    await flushPromises()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    // Calendar forwarding's own label only renders on the email-forwarding tab.
    expect(wrapper.text()).toContain('Calendar invite forwarding')
  })

  it('auto-selects a newly added webhook target back into the calendar select (verified immediately)', async () => {
    const wrapper = await mountSettings({ tab: 'email-forwarding' }, testAccount())
    vi.mocked(api.createForwardingAddress).mockResolvedValue(
      ok({ target: 'https://hooks.example.com/new', type: 'webhook', status: 'verified', createdAt: '2025-02-01T00:00:00Z' }),
    )
    vi.mocked(api.updateAccount).mockResolvedValue(ok(testAccount({ defaultCalendarInviteForwardingTargetId: 'https://hooks.example.com/new' })))

    await wrapper.get('#calendar-forwarding').setValue('__add_new_forwarding_target__')
    await flushPromises()
    const dialog = wrapper.get('[role="dialog"]')

    await dialog.findAll('button').find((b) => b.text() === 'Webhook')!.trigger('click')
    await dialog.get('input').setValue('https://hooks.example.com/new')
    await dialog.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    const calendarSelect = wrapper.get('#calendar-forwarding').element as HTMLSelectElement
    expect(calendarSelect.value).toBe('https://hooks.example.com/new')
    expect(api.updateAccount).toHaveBeenCalledWith('acc_1', expect.objectContaining({
      defaultCalendarInviteForwardingTargetId: 'https://hooks.example.com/new',
    }))
  })

  it('does not select a newly added pending email target, and shows a verification toast instead', async () => {
    const wrapper = await mountSettings({ tab: 'email-forwarding' }, testAccount())
    vi.mocked(api.createForwardingAddress).mockResolvedValue(
      ok({ target: 'new@example.com', type: 'email', status: 'pending', createdAt: '2025-02-01T00:00:00Z' }),
    )

    await wrapper.get('#calendar-forwarding').setValue('__add_new_forwarding_target__')
    await flushPromises()
    const dialog = wrapper.get('[role="dialog"]')

    await dialog.findAll('button').find((b) => b.text() === 'Email')!.trigger('click')
    await dialog.get('input').setValue('new@example.com')
    await dialog.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    const calendarSelect = wrapper.get('#calendar-forwarding').element as HTMLSelectElement
    // Reverted to "None" (empty) — the pending target isn't selectable yet.
    expect(calendarSelect.value).toBe('')
    expect(api.updateAccount).not.toHaveBeenCalled()

    const { toasts } = useToast()
    expect(toasts.value.some((t) => t.message.includes('new@example.com') && t.message.includes('verified'))).toBe(true)
  })

  it('the Email & Forwarding tab\'s own "Add Forwarding Target" button opens the modal without touching any select', async () => {
    const wrapper = await mountSettings({ tab: 'email-forwarding' }, testAccount())
    await wrapper.findAll('button').find((b) => b.text() === 'Add Forwarding Target')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  })
})
