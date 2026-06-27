import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ok } from 'neverthrow'
import { createRouter, createMemoryHistory } from 'vue-router'
import SettingsView from '@/views/SettingsView.vue'
import { useAccountStore } from '@/stores/account'
import type { Account, ForwardingTarget } from '@/types/server'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: {
      listAccounts: vi.fn(),
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

const testAccount: Account = {
  accountId: 'acc_1',
  name: 'Test',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', component: SettingsView },
    ],
  })
}

let pinia: ReturnType<typeof createPinia>

async function mountForwardingTab(forwarding: ForwardingTarget[]) {
  vi.mocked(api.listForwardingAddresses).mockResolvedValue(ok(forwarding))

  const router = makeRouter()
  await router.push('/settings?tab=forwarding')
  await router.isReady()

  const wrapper = mount(SettingsView, {
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return wrapper
}

describe('SettingsView — forwarding verification date', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    useAccountStore().account = testAccount
    vi.mocked(api.listAccounts).mockResolvedValue(ok([testAccount]))
  })

  it('shows "Verified on <date>" when verifiedAt is set', async () => {
    const fwd: ForwardingTarget = {
      target: 'forward@example.com',
      type: 'email',
      status: 'verified',
      createdAt: '2025-01-01T00:00:00Z',
      verifiedAt: '2025-06-15T10:30:00Z',
    }
    const wrapper = await mountForwardingTab([fwd])

    const verifiedText = wrapper.find('.text-ctp-green')
    expect(verifiedText.exists()).toBe(true)
    expect(verifiedText.text()).toContain('Verified on')
    // The formatted date should contain "Jun" and "2025" (medium dateStyle)
    expect(verifiedText.text()).toMatch(/Jun.*2025/)
  })

  it('shows "Pending verification" when verifiedAt is absent', async () => {
    const fwd: ForwardingTarget = {
      target: 'pending@example.com',
      type: 'email',
      status: 'pending',
      createdAt: '2025-01-01T00:00:00Z',
    }
    const wrapper = await mountForwardingTab([fwd])

    const pendingText = wrapper.find('.text-ctp-yellow')
    expect(pendingText.exists()).toBe(true)
    expect(pendingText.text()).toBe('Pending verification')

    // Should NOT show verified badge
    expect(wrapper.find('.text-ctp-green').exists()).toBe(false)
  })
})
